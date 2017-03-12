import _ = require('lodash')
import Victor = require('victor')
import moment = require('moment')
const utils = require('./utils')


function getForecastItemsFromGrib(gribPath, latitude, longitude, startTime = 0) {
  return utils.grib_get(['-p', 'shortName,dataDate,dataTime,forecastTime', '-l', latitude + ',' + longitude + ',1', gribPath])
    .then(parseForecastTimeAndItems)
    .then(function(forecastTimeAndItems) {
      forecastTimeAndItems.forecastItems = getForecastItemsAfterStartTime(forecastTimeAndItems.forecastItems)
      return forecastTimeAndItems
    })

  function getForecastItemsAfterStartTime(forecastItems) {
    return forecastItems.filter(function(item) { return moment(item.time).isAfter(moment(startTime)) })
  }
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
function parseForecastTimeAndItems(gribGetOutput) {
  const lines = _.filter(gribGetOutput.split(/\n/), function(line: string) { return line.trim() !== '' })
  const forecastData = {}
  var itemDate, itemTime

  lines.forEach(function(line) {
    const parts = _.filter(line.split(/ /), function(line) { return line.trim() !== '' })
    itemDate = parts[1]
    itemTime = parts[2]
    const itemHour = parts[3]
    const datumName = parts[0]
    const datumValue = parseFloat(parts[4])
    _.set(forecastData, itemHour + '.' + datumName, datumValue)
  })

  _.forOwn(forecastData, function(value: any) {
    const wind = new Victor(value['10v'], value['10u'])
    const windSpeedMs = +wind.length().toFixed(1)
    const windDir = Math.round(wind.horizontalAngleDeg() + 180)
    value.windSpeedMs = windSpeedMs
    value.windDir = windDir
    value.pressureMbar = +(value.msl / 100).toFixed(1)
  })

  const itemDateTime = utils.parseHourlyTimestampFromGribItemDateAndTime(itemDate, itemTime)

  _.forOwn(forecastData, function(value: any, key) {
    value.time = itemDateTime.clone().add(key, 'h').toDate()
  })

  return { forecastTime: itemDateTime.toDate(), forecastItems: _.values(forecastData) }
}

module.exports = {
  getForecastItemsFromGrib: getForecastItemsFromGrib
}