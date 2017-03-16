import {PointForecast, Coords, AreaForecast, Bounds, ForecastItem} from "./ForecastDomain"
var gribGet = require('./utils').grib_get
import _ = require('lodash')
import Bluebird = require("bluebird")
import fs = require('fs')
const accessAsync = Bluebird.promisify<void, string, number>(fs.access)
var gribParser = require('./grib_get_parser')
import geolib = require('geolib')
import moment = require('moment')
var logger = require('./logging').console
import utils = require('./utils')
import R = require('ramda')
import L = require('partial.lenses')

const CPU_COUNT = require('os').cpus().length
const LAT_GRID_INCREMENT = 0.2
const LNG_GRID_INCREMENT = 0.5
let cachedForecast: AreaForecast


export function getAreaForecast(bounds: Bounds, startTime: Date = new Date(0)): AreaForecast {
  const corners = [
    {lat: bounds.swCorner.lat, lng: bounds.swCorner.lng},
    {lat: bounds.neCorner.lat, lng: bounds.swCorner.lng},
    {lat: bounds.neCorner.lat, lng: bounds.neCorner.lng},
    {lat: bounds.swCorner.lat, lng: bounds.neCorner.lng}
  ]

  return L.remove(['pointForecasts',
      L.elems,
      L.choose(forecast => forecastInBounds(forecast, corners)
        ? ['forecastItems', L.elems, L.when(isItemBefore(startTime))]  // PointForecast in bounds -> filter items by time
        : []                                                           // PointForecast out of bounds -> remove it itself
      )],
    cachedForecast)


  function isItemBefore(time: Date) {
    return (item: ForecastItem) => moment(item.time).isBefore(moment(time))
  }

  function forecastInBounds(forecast: PointForecast, corners: Coords[]): boolean {
    return geolib.isPointInside({latitude: forecast.lat, longitude: forecast.lng}, corners)
  }
}

export function refreshFrom(gribFile: string): Bluebird<void> {
  const startTime = new Date()
  logger.info('Refreshing forecast cache..')
  return getGribTimestamp(gribFile)
    .then(timestamp => getGribBounds(gribFile)
      .then(bounds => createForecastLocations(bounds, LAT_GRID_INCREMENT, LNG_GRID_INCREMENT))
      .then(forecastLocations => getPointForecastsForLocations(forecastLocations, gribFile))
      .then(pointForecasts => { cachedForecast = { publishTime: timestamp, pointForecasts } })
      .then(() => { logger.info('Forecast cache refreshed in ' + (new Date().getTime() - startTime.getTime()) + 'ms. Contains ' + cachedForecast.pointForecasts.length + ' points.')})
    )

  function getPointForecastsForLocations(locations: Coords[], gribFile: string): Bluebird<PointForecast[]> {
    return Bluebird.map(locations, location => gribParser.getPointForecastFromGrib(gribFile, location.lat, location.lng), {concurrency: CPU_COUNT})
  }

  function createForecastLocations(bounds: Bounds, latIncrement: number, lngIncrement: number): Coords[] {
    const latitudes = utils.rangeStep(bounds.swCorner.lat, bounds.neCorner.lat, latIncrement).map(roundTo1Decimal)
    const longitudes = utils.rangeStep(bounds.swCorner.lng, bounds.neCorner.lng, lngIncrement).map(roundTo1Decimal)

    return R.flatten<Coords>(latitudes.map(lat => longitudes.map(lng => ({lat, lng}))))
  }
}



function getGribBounds(gribFile: string): Bluebird<Bounds> {
  // TODO: Type gribGet properly
  return gribGet(['-p', 'latitudeOfFirstGridPointInDegrees,longitudeOfFirstGridPointInDegrees,latitudeOfLastGridPointInDegrees,longitudeOfLastGridPointInDegrees', gribFile])
    .then(output => output.split('\n')[0])
    .then(line => {
      const coords = line.trim().split(/ /).map(parseFloat)
      return {swCorner: {lat: coords[0], lng: coords[1]}, neCorner: {lat: coords[2], lng: coords[3]}}
    })
}

export function getGribTimestamp(gribFile: string): Bluebird<Date> {
  return accessAsync(gribFile, fs.constants.R_OK)
    .then(() => gribGet(['-p', 'dataDate,dataTime', gribFile]))
    .then(output => {
      const parts = output.split(/\n/)[0].split(/ /)
      const dataDate = parts[0]
      const dataTime = parts[1]
      return utils.parseHourlyTimestampFromGribItemDateAndTime(dataDate, dataTime).toDate()
    })
    .catch(() => undefined)
}

function roundTo1Decimal(num: number): number {
  return Math.round(num * 10) / 10
}
