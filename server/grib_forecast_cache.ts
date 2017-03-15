import {PointForecast, Coords, AreaForecast, Bounds} from "./ForecastDomain"
var gribGet = require('./utils').grib_get
import _ = require('lodash')
import Bluebird = require("bluebird")
import fs = require('fs')
const accessAsync = Bluebird.promisify<void, string, number>(fs.access)
var gribParser = require('./grib_get_parser')
var geolib = require('geolib')
var moment = require('moment')
var logger = require('./logging.js').console
import utils = require('./utils')
import R = require('ramda')

var CPU_COUNT = require('os').cpus().length
var LAT_GRID_INCREMENT = 0.2
var LNG_GRID_INCREMENT = 0.5
let cachedForecasts: PointForecast[] = []
var gribTimestamp = undefined


export function getAreaForecast(bounds: Bounds, startTime: Date = new Date(0)): AreaForecast {
  const corners = [
    {lat: bounds.swCorner.lat, lng: bounds.swCorner.lng},
    {lat: bounds.neCorner.lat, lng: bounds.swCorner.lng},
    {lat: bounds.neCorner.lat, lng: bounds.neCorner.lng},
    {lat: bounds.swCorner.lat, lng: bounds.neCorner.lng}
  ]

  const forecastsInBoundsFilteredByTime = cachedForecasts
    .filter(forecastInBounds(corners))
    .map(forecast => utils.removeOlderForecastItems(forecast, startTime))

  return {
    publishTime: gribTimestamp,
    pointForecasts: forecastsInBoundsFilteredByTime
  }

  function forecastInBounds(corners: Coords[]): (PointForecast) => boolean {
    return forecast => geolib.isPointInside({latitude: forecast.lat, longitude: forecast.lng}, corners)
  }
}

export function refreshFrom(gribFile) {
  var startTime = new Date()
  logger.info('Refreshing forecast cache..')
  return getGribTimestamp(gribFile)
    .tap(function(timestamp) { gribTimestamp = timestamp })
    .then(function() { return getGribBounds(gribFile) })
    .then(function(bounds) { return createForecastLocations(bounds, LAT_GRID_INCREMENT, LNG_GRID_INCREMENT) })
    .then(function(forecastLocations) { return getPointForecastsForLocations(forecastLocations, gribFile) })
    .then(function(forecasts) { cachedForecasts = forecasts })
    .then(function() { logger.info('Forecast cache refreshed in ' + (new Date().getTime() - startTime.getTime()) + 'ms. Contains ' + cachedForecasts.length + ' points.')})
}


function getPointForecastsForLocations(locations: Coords[], gribFile: string): Bluebird<PointForecast[]> {
  return Bluebird.map(locations, location => gribParser.getPointForecastFromGrib(gribFile, location.lat, location.lng), {concurrency: CPU_COUNT})
}

function createForecastLocations(bounds, latIncrement, lngIncrement): Coords[] {
  const latitudes = utils.rangeStep(bounds.swCorner.lat, bounds.neCorner.lat, latIncrement).map(roundTo1Decimal)
  const longitudes = utils.rangeStep(bounds.swCorner.lng, bounds.neCorner.lng, lngIncrement).map(roundTo1Decimal)

  return R.flatten<Coords>(latitudes.map(lat => longitudes.map(lng => ({lat, lng}))))
}

function getGribBounds(gribFile): Bounds {
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

function roundTo1Decimal(num) {
  return Math.round(num * 10) / 10
}
