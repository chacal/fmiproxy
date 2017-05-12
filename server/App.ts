import express = require('express')
import cors = require('cors')
import compression = require('compression')
import Bluebird = require('bluebird')
import morgan = require('morgan')
import expressValidator = require('express-validator')

import * as Logging from './Logging'
import * as ObservationStations from './ObservationStations'
import * as GribReader from './GribReader'
import * as GribDownloader from './GribDownloader'
import * as ForecastCache from './ForecastCache'
import Observations from './Observations'

const logger = Logging.consoleLogger
const FMIAPIKey = process.env.FMI_API_KEY || require('../apikey').key
const MOUNT_PREFIX = process.env.MOUNT_PREFIX || ''
const observations = Observations(FMIAPIKey)

const app = express()
app.set('port', (process.env.PORT || 8000))
app.use(morgan(Logging.requestLoggingFormat, { stream: Logging.fileLoggerStream }))
app.use(cors())
app.use(compression())
app.use(expressValidator())

logger.info("Starting fmiproxy..")

Bluebird.all([ObservationStations.init(FMIAPIKey), GribDownloader.init(FMIAPIKey)])
  .then(startServer)

function startServer(): void {
  logger.info("Starting HTTP server..")

  app.get(MOUNT_PREFIX + "/nearest-station", (req, res, next) => {
    checkLatLonParams(req)
      .then(() => res.json(ObservationStations.getNearestStation(req.query.lat, req.query.lon)))
      .catch(next)
  })

  app.get(MOUNT_PREFIX + "/hirlam-forecast", (req, res, next) => {
    if(req.query.bounds && (req.query.lat || req.query.lon)) {
      res.status(400).json({message: 'Use either bounds or lat & lon, not both!'})
    } else if(req.query.bounds) {
      try {
        const coords = req.query.bounds.trim().split(',').map(parseFloat)
        res.json(ForecastCache.getBoundedAreaForecast({ swCorner: { lat: coords[0], lng: coords[1] }, neCorner: { lat: coords[2], lng: coords[3] } }, req.query.startTime))
      } catch (e) {
        next(e)
      }
    } else if(req.query.lat && req.query.lon) {
      GribReader.getPointForecastFromGrib(GribDownloader.latestGribFile, req.query.lat, req.query.lon, req.query.startTime)
        .then(pf => res.json(pf))
        .catch(next)
    } else {
      res.json(ForecastCache.getAreaForecast())
    }
  })

  app.get(MOUNT_PREFIX + "/observations", (req, res, next) => {
    if(req.query.geoid && req.query.place) {
      res.status(400).json({message: 'Use either geiod or place, not both!'})
    } else if(req.query.geoid) {
      observations.getStationObservationForGeoid(req.query.geoid)
        .then(observation => res.json(observation))
        .catch(next)
    } else if(req.query.place) {
      observations.getStationObservationForPlace(req.query.place)
        .then(observations => res.json(observations))
        .catch(next)
    } else {
      res.status(400).json({message: 'Either geiod or place must be given!'})
    }
  })

  app.listen(app.get('port'), () => logger.info("FMI proxy is running at localhost:" + app.get('port')))

  app.use((err, req, res, next) => {
    logger.error(err.mapped() || err)
    res.status(err.status || 500)
    res.json({
      message: err.message,
      error: err.mapped() || err
    })
  })

  function checkLatLonParams(req) {
    req.check('lat').notEmpty().isDecimal()
    req.check('lon').notEmpty().isDecimal()
    return req.getValidationResult()
      .then(result => result.throw())
  }
}
