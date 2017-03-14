import {ForecastItem} from "./ForecastDomain"
var gribGet = require('./utils').grib_get
var _ = require('lodash')
var BPromise = require('bluebird')
var fs = BPromise.promisifyAll(require('fs'))
var gribParser = require('./grib_get_parser')
var geolib = require('geolib')
var moment = require('moment')
var logger = require('./logging.js').console
var utils = require('./utils.js')
import * as L from 'partial.lenses'

var CPU_COUNT = require('os').cpus().length
var LAT_GRID_INCREMENT = 0.2
var LNG_GRID_INCREMENT = 0.5
var cachedForecasts = []
var gribTimestamp = undefined


function getForecasts(bounds, startTime) {
  var startTime = moment(startTime || 0)
  var corners = [
    {latitude: bounds.swCorner.lat, longitude: bounds.swCorner.lng},
    {latitude: bounds.neCorner.lat, longitude: bounds.swCorner.lng},
    {latitude: bounds.neCorner.lat, longitude: bounds.neCorner.lng},
    {latitude: bounds.swCorner.lat, longitude: bounds.neCorner.lng}
  ]

  const forecastsInBounds = L.collect([L.elems, L.when(forecastInBounds(corners))], cachedForecasts)
  const forecasts = { forecastTime: gribTimestamp, forecastItems: forecastsInBounds }

  return utils.removeOlderForecastItems(forecasts, startTime)

  function forecastInBounds(corners: {latitude: number, longitude: number}[]): (any) => boolean {
    return forecast => geolib.isPointInside({ latitude: forecast.lat, longitude: forecast.lng }, corners)
  }
}

function refreshFrom(gribFile) {
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


function getPointForecastsForLocations(locations, gribFile) {
  return BPromise.map(locations, function(location) {
    return gribParser.getPointForecastFromGrib(gribFile, location.lat, location.lng)
      .then(function(forecast) { return _.extend(location, { items: forecast.forecastItems }) })
  }, { concurrency: CPU_COUNT })
}

function createForecastLocations(bounds, latIncrement, lngIncrement) {
  var forecastLocations = []
  var latitudes = _.map(_.range(bounds.swCorner.lat, bounds.neCorner.lat, latIncrement), roundTo1Decimal)
  var longitudes = _.map(_.range(bounds.swCorner.lng, bounds.neCorner.lng, lngIncrement), roundTo1Decimal)

  latitudes.forEach(function(lat) {
    longitudes.forEach(function(lng) {
      forecastLocations.push({lat: lat, lng: lng})
    })
  })
  return forecastLocations
}

function getGribBounds(gribFile) {
  return gribGet(['-p', 'latitudeOfFirstGridPointInDegrees,longitudeOfFirstGridPointInDegrees,latitudeOfLastGridPointInDegrees,longitudeOfLastGridPointInDegrees', gribFile])
    .then(function(output) { return output.split('\n')[0] })
    .then(function(line) {
      var coords = _.map(line.trim().split(/ /), parseFloat)
      return { swCorner: { lat: coords[0], lng: coords[1] }, neCorner: { lat: coords[2], lng: coords[3] }}
    })
}

function getGribTimestamp(gribFile) {
  return fs.statAsync(gribFile)
    .then(function() {
      return gribGet(['-p', 'dataDate,dataTime', gribFile])
    })
    .then(function(output) {
      var parts = output.split(/\n/)[0].split(/ /)
      var dataDate = parts[0]
      var dataTime = parts[1]
      return utils.parseHourlyTimestampFromGribItemDateAndTime(dataDate, dataTime).toDate()
    })
    .catch(function() {
      return undefined
    })

}

function roundTo1Decimal(num) {
  return Math.round( num * 10 ) / 10
}

module.exports = {
  refreshFrom: refreshFrom,
  getForecasts: getForecasts,
  getGribTimestamp: getGribTimestamp
}