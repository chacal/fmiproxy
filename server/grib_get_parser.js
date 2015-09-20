var Promise = require('bluebird')
var fs = Promise.promisifyAll(require('fs'))
var _ = require('lodash')
var Victor = require('victor')
var moment = require('moment')
var utils = require('./utils')


function getForecastFromGrib(gribPath, latitude, longitude) {
  return utils.grib_get(['-p', 'shortName,dataDate,dataTime,forecastTime', '-l', latitude + ',' + longitude + ',1', gribPath])
    .then(parseForecast)
}


/*
  Forecast format:
 [
   { '10v': 3.72291, '10u': 4.61555, msl: 100408, prate: 0, windSpeedMs: 5.9, windDir: 231, pressureMbar: 1004.1, time: Fri Sep 18 2015 20:00:00 GMT+0300 (EEST) },
   { '10v': 3.34411, '10u': 4.40901, msl: 100432, prate: 0, windSpeedMs: 5.5, windDir: 233, pressureMbar: 1004.3, time: Fri Sep 18 2015 21:00:00 GMT+0300 (EEST) }
   ...
   ...
 ]
 */
function parseForecast(gribGetOutput) {
  var lines = _.filter(gribGetOutput.split(/\n/), function(line) { return line.trim() !== '' })
  var forecastData = {}
  var forecastDate, forecastTime

  lines.forEach(function(line) {
    var parts = _.filter(line.split(/ /), function(line) { return line.trim() !== '' })
    forecastDate = parts[1]
    forecastTime = parts[2]
    var forecastHour = parts[3]
    var datumName = parts[0]
    var datumValue = parseFloat(parts[4])
    _.set(forecastData, forecastHour + '.' + datumName, datumValue)
  })

  _.forOwn(forecastData, function(value) {
    var wind = new Victor(value['10v'], value['10u'])
    var windSpeedMs = +wind.length().toFixed(1)
    var windDir = Math.round(wind.horizontalAngleDeg() + 180)
    value.windSpeedMs = windSpeedMs
    value.windDir = windDir
    value.pressureMbar = +(value.msl / 100).toFixed(1)
  })

  var forecastDateTime = moment(forecastDate + forecastTime + '+0000', 'YYYYMMDDHHmmZ')

  _.forOwn(forecastData, function(value, key) {
    value.time = forecastDateTime.clone().add(key, 'h').toDate()
  })

  return _.values(forecastData)
}

module.exports = {
  getForecastFromGrib: getForecastFromGrib
}