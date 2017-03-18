import express = require('express')
import cors = require('cors')
import compression = require('compression')
import Bluebird = require('bluebird')
import morgan = require('morgan')
var logging = require('./logging.js')
const logger = logging.console
const FMIAPIKey = process.env.FMI_API_KEY || require('../apikey').key
const MOUNT_PREFIX = process.env.MOUNT_PREFIX || ''
import * as geocode from './reverse_geocode'
import * as gribParser from './grib_get_parser'
var observations = require('./observations')(FMIAPIKey)
import * as gribDownloader from './grib_downloader'
import * as ForecastCache from './grib_forecast_cache'

var app = express()
app.set('port', (process.env.PORT || 8000))
app.use(morgan(logging.requestLoggingFormat, { stream: logging.fileLoggerStream }))
app.use(cors())
app.use(compression())

logger.info("Starting fmiproxy..")

Bluebird.join(geocode.init(FMIAPIKey), gribDownloader.init(FMIAPIKey))
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
        const coords = req.query.bounds.trim().split(',').map(parseFloat)
        res.json(ForecastCache.getAreaForecast({ swCorner: { lat: coords[0], lng: coords[1] }, neCorner: { lat: coords[2], lng: coords[3] } }, req.query.startTime))
      } catch (e) {
        next(e)
      }
    } else if(req.query.lat && req.query.lon) {
      gribParser.getPointForecastFromGrib(gribDownloader.latestGribFile, req.query.lat, req.query.lon, req.query.startTime)
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
