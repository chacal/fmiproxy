var express = require('express')
var cors = require('cors')
var compression = require('compression')
var BPromise = require('bluebird')
var _ = require('lodash')
var morgan = require('morgan')
var logging = require('./logging.js')
var logger = logging.console
var FMIAPIKey = process.env.FMI_API_KEY || require('../apikey').key
var MOUNT_PREFIX = process.env.MOUNT_PREFIX || ''
var geocode = require('./reverse_geocode.js')
var gribParser = require('./grib_get_parser.js')
var observations = require('./observations.js')(FMIAPIKey)
var gribDownloader = require('./grib_downloader.js')
import * as ForecastCache from './grib_forecast_cache'

var app = express()
app.set('port', (process.env.PORT || 8000))
app.use(morgan(logging.requestLoggingFormat, { stream: logging.fileLoggerStream }))
app.use(cors())
app.use(compression())

logger.info("Starting fmiproxy..")

BPromise.join(geocode.init(FMIAPIKey), gribDownloader.init(FMIAPIKey))
  .then(startServer)

function startServer() {
  logger.info("Starting HTTP server..")

  app.get(MOUNT_PREFIX + "/nearest-station", function(req, res, next) {
    res.json(geocode.getNearestStation(req.query.lat, req.query.lon)).end()
  })

  app.get(MOUNT_PREFIX + "/hirlam-forecast", function(req, res, next) {
    if(req.query.bounds && (req.query.lat || req.query.lon)) {
      res.status(400).json({message: 'Use either bounds or lat & lon, not both!'}).end()
    } else if(req.query.bounds) {
      try {
        var coords = _.map(req.query.bounds.trim().split(','), parseFloat)
        res.json(ForecastCache.getAreaForecast({ swCorner: { lat: coords[0], lng: coords[1] }, neCorner: { lat: coords[2], lng: coords[3] } }, req.query.startTime))
      } catch (e) {
        next(e)
      }
    } else if(req.query.lat && req.query.lon) {
      gribParser.getPointForecastFromGrib(gribDownloader.gribFile, req.query.lat, req.query.lon, req.query.startTime)
        .then(function(forecast) { res.json(forecast).end() })
        .catch(next)
    } else {
      res.status(400).json({message: 'Either bounds or lat & lon must be given!'}).end()
    }
  })

  app.get(MOUNT_PREFIX + "/observations", function(req, res, next) {
    if(req.query.geoid && req.query.place) {
      res.status(400).json({message: 'Use either geiod or place, not both!'}).end()
    } else if(req.query.geoid) {
      observations.getObservationsForGeoid(req.query.geoid)
        .then(function(observations) { res.json(observations).end() })
        .catch(next)
    } else if(req.query.place) {
      observations.getObservationsForPlace(req.query.place)
        .then(function(observations) { res.json(observations).end() })
        .catch(next)
    } else {
      res.status(400).json({message: 'Either geiod or place must be given!'}).end()
    }
  })

  app.listen(app.get('port'), function() {
    logger.info("FMI proxy is running at localhost:" + app.get('port'))
  })

  app.use(function (err, req, res, next) {
    logger.error(err)
    res.status(err.status || 500)
    res.json({
      message: err.message,
      error: err
    })
  })
}
