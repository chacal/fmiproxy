var gribGet = require('./utils').grib_get
var _ = require('lodash')
var Promise = require('bluebird')
var gribParser = require('./grib_get_parser')
var geolib = require('geolib')
var moment = require('moment')


var CPU_COUNT = require('os').cpus().length
var LAT_GRID_INCREMENT = 0.2
var LNG_GRID_INCREMENT = 0.5
var cachedForecasts = []


function getForecasts(bounds, startTime) {
  var startTime = moment(startTime || 0)
  var corners = [
    {latitude: bounds.swCorner.lat, longitude: bounds.swCorner.lng},
    {latitude: bounds.neCorner.lat, longitude: bounds.swCorner.lng},
    {latitude: bounds.neCorner.lat, longitude: bounds.neCorner.lng},
    {latitude: bounds.swCorner.lat, longitude: bounds.neCorner.lng}
  ]
  var forecastsInBounds = _.filter(cachedForecasts, function(forecast) {
    return geolib.isPointInside({ latitude: forecast.lat, longitude: forecast.lng }, corners)
  })
  var filteredByTime = _.map(forecastsInBounds, function(forecast) {
    forecast.forecasts = _.filter(forecast.forecasts, function(item) { return moment(item.time).isAfter(startTime) })
    return forecast
  })
  return filteredByTime
}

function refreshFrom(gribFile) {
  var startTime = new Date()
  console.log('Refreshing forecast cache..')
  return getGribBounds(gribFile)
    .then(function(bounds) { return createForecastPoints(bounds, LAT_GRID_INCREMENT, LNG_GRID_INCREMENT) })
    .then(function(forecastPoints) { return getForecastsFromGrib(forecastPoints, gribFile) })
    .then(function(forecasts) { cachedForecasts = forecasts })
    .then(function() { console.log('Forecast cache refreshed in ' + (new Date() - startTime) + 'ms. Contains ' + cachedForecasts.length + ' points.')})
}


function getForecastsFromGrib(points, gribFile) {
  return Promise.map(points, function(point) {
    return gribParser.getForecastFromGrib(gribFile, point.lat, point.lng)
      .then(function(forecast) { return _.extend(point, { forecasts: forecast }) })
  }, { concurrency: CPU_COUNT })
}

function createForecastPoints(bounds, latIncrement, lngIncrement) {
  var forecastPoints = []
  var latitudes = _.map(_.range(bounds.swCorner.lat, bounds.neCorner.lat, latIncrement), roundTo1Decimal)
  var longitudes = _.map(_.range(bounds.swCorner.lng, bounds.neCorner.lng, lngIncrement), roundTo1Decimal)

  latitudes.forEach(function(lat) {
    longitudes.forEach(function(lng) {
      forecastPoints.push({lat: lat, lng: lng})
    })
  })
  return forecastPoints
}

function getGribBounds(gribFile) {
  return gribGet(['-p', 'latitudeOfFirstGridPointInDegrees,longitudeOfFirstGridPointInDegrees,latitudeOfLastGridPointInDegrees,longitudeOfLastGridPointInDegrees', gribFile])
    .then(function(output) { return output.split('\n')[0] })
    .then(function(line) {
      var coords = _.map(line.trim().split(/ /), parseFloat)
      return { swCorner: { lat: coords[0], lng: coords[1] }, neCorner: { lat: coords[2], lng: coords[3] }}
    })
}

function roundTo1Decimal(num) {
  return Math.round( num * 10 ) / 10
}

module.exports = {
  refreshFrom: refreshFrom,
  getForecasts: getForecasts
}