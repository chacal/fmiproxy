import * as express from "express"
import cors = require('cors')
import compression = require('compression')
import morgan = require('morgan')
import * as R from 'ramda'
import L = require('partial.lenses')
import { query } from 'express-validator'

import * as Logging from './Logging'
import * as ObservationStations from './ObservationStations'
import * as GribReader from './GribReader'
import * as GribDownloader from './GribDownloader'
import * as ForecastCache from './ForecastCache'
import Observations from './Observations'
import { ObservationItem, StationObservation } from './ForecastDomain'
import { getCityForecast } from './CityForecast'
import { validateRequest } from './Utils'

const logger = Logging.consoleLogger
const MOUNT_PREFIX = process.env.MOUNT_PREFIX || ''
const observations = Observations()

const app = express()
app.set('port', (process.env.PORT || 8000))
app.use(morgan(Logging.requestLoggingFormat, { stream: Logging.fileLoggerStream }))
app.use(cors())
app.use(compression())

logger.info("Starting fmiproxy..")

Promise.all([ObservationStations.init(), GribDownloader.init()])
  .then(startServer)

function startServer(): void {
  logger.info("Starting HTTP server..")

  app.get(MOUNT_PREFIX + "/nearest-station",
    checkLatLonParams(),
    (req, res) => {
      const lat = parseFloat(req.query.lat as string)
      const lon = parseFloat(req.query.lon as string)
      res.json(ObservationStations.getNearestStation(lat, lon, req.query.marineOnly === 'true'))
    })

  app.get(MOUNT_PREFIX + "/hirlam-forecast", (req, res, next) => {
    if(req.query.bounds && (req.query.lat || req.query.lon)) {
      res.status(400).json({message: 'Use either bounds or lat & lon, not both!'})
    } else if(req.query.bounds) {
      const startTime = new Date(req.query.startTime as string)
      try {
        const coords = (req.query.bounds as string).trim().split(',').map(parseFloat)
        res.json(ForecastCache.getBoundedAreaForecast({ swCorner: { latitude: coords[0], longitude: coords[1] }, neCorner: { latitude: coords[2], longitude: coords[3] } }, startTime))
      } catch (e) {
        next(e)
      }
    } else if(req.query.lat && req.query.lon) {
      const lat = parseFloat(req.query.lat as string)
      const lon = parseFloat(req.query.lon as string)
      const startTime = new Date(req.query.startTime as string)
      GribReader.getPointForecastFromGrib(GribDownloader.latestGribFile, lat, lon, startTime)
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
      observations.getStationObservationForGeoid(req.query.geoid as string)
        .then(observation => respondWithObservation(req, res, observation))
        .catch(next)
    } else if(req.query.place) {
      observations.getStationObservationForPlace(req.query.place as string)
        .then(observation => respondWithObservation(req, res, observation))
        .catch(next)
    } else {
      res.status(400).json({message: 'Either geiod or place must be given!'})
    }
  })

  app.get(MOUNT_PREFIX + "/nearest-observations", checkLatLonParams(), (req, res) => {
    const lat = parseFloat(req.query.lat as string)
    const lon = parseFloat(req.query.lon as string)
    const nearestStation = ObservationStations.getNearestStation(lat, lon, req.query.marineOnly === 'true')
    observations.getStationObservationForGeoid(nearestStation.geoid)
      .then(observation => respondWithObservation(req, res, observation))
  })

  app.get(MOUNT_PREFIX + "/city-forecast", (req, res, next) => {
    if(req.query.city === undefined) {
      res.status(400).json({message: 'city parameter must be given!'})
    } else {
      getCityForecast(req.query.city as string)
        .then(forecast => forecast !== undefined ? res.json(forecast) : res.status(404).json({message: `Forecast for city '${req.query.city}' not found.`}))
        .catch(next)
    }
  })

  app.listen(app.get('port'), () => logger.info("FMI proxy is running at localhost:" + app.get('port')))

  app.use((err, req, res, next) => {
    logger.error(err.mapped ? JSON.stringify(err.mapped()) : err)
    res.status(err.status || 500)
    res.json({
      message: err.message,
      error: err.mapped ? err.mapped() : err
    })
  })

  function checkLatLonParams() {
    return validateRequest([
        query('lat').notEmpty().isDecimal(),
        query('lon').notEmpty().isDecimal(),
      ]
    )
  }

  function respondWithObservation(req, res, observation: StationObservation) {
    const sortByTime: (obs: ObservationItem[]) => ObservationItem[] = R.sortBy(R.prop('time'))

    res.json(req.query.latest ? onlyLatest(observation) : observation)
    
    function onlyLatest(observation: StationObservation): StationObservation { return L.modify('observations', R.pipe(sortByTime, R.last), observation) }
  }
}
