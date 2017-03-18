import express = require('express')
import cors = require('cors')
import compression = require('compression')
import Bluebird = require('bluebird')
import morgan = require('morgan')
import * as Logging from './logging'
const logger = Logging.consoleLogger
const FMIAPIKey = process.env.FMI_API_KEY || require('../apikey').key
const MOUNT_PREFIX = process.env.MOUNT_PREFIX || ''
import * as ObservationStations from './ObservationStations'
import * as GribReader from './GribReader'
import Observations from './Observations'
const observations = Observations(FMIAPIKey)
import * as gribDownloader from './grib_downloader'
import * as ForecastCache from './grib_forecast_cache'

const app = express()
app.set('port', (process.env.PORT || 8000))
app.use(morgan(Logging.requestLoggingFormat, { stream: Logging.fileLoggerStream }))
app.use(cors())
app.use(compression())

logger.info("Starting fmiproxy..")

Bluebird.all([ObservationStations.init(FMIAPIKey), gribDownloader.init(FMIAPIKey)])
  .then(startServer)

function startServer(): void {
  logger.info("Starting HTTP server..")

  app.get(MOUNT_PREFIX + "/nearest-station", (req, res) => res.json(ObservationStations.getNearestStation(req.query.lat, req.query.lon)))

  app.get(MOUNT_PREFIX + "/hirlam-forecast", (req, res, next) => {
    if(req.query.bounds && (req.query.lat || req.query.lon)) {
      res.status(400).json({message: 'Use either bounds or lat & lon, not both!'})
    } else if(req.query.bounds) {
      try {
        const coords = req.query.bounds.trim().split(',').map(parseFloat)
        res.json(ForecastCache.getAreaForecast({ swCorner: { lat: coords[0], lng: coords[1] }, neCorner: { lat: coords[2], lng: coords[3] } }, req.query.startTime))
      } catch (e) {
        next(e)
      }
    } else if(req.query.lat && req.query.lon) {
      GribReader.getPointForecastFromGrib(gribDownloader.latestGribFile, req.query.lat, req.query.lon, req.query.startTime)
        .then(pf => res.json(pf))
        .catch(next)
    } else {
      res.status(400).json({message: 'Either bounds or lat & lon must be given!'})
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

  app.use((err, req, res) => {
    logger.error(err)
    res.status(err.status || 500)
    res.json({
      message: err.message,
      error: err
    })
  })
}
