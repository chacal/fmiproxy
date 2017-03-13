import _ = require('lodash')
import Victor = require('victor')
import moment = require('moment')
const utils = require('./utils')
import ForecastItem from './ForecastItem'

function getForecastItemsFromGrib(gribPath, latitude, longitude, startTime = 0) {
  return utils.grib_get(['-p', 'shortName,dataDate,dataTime,forecastTime', '-l', latitude + ',' + longitude + ',1', gribPath])
    .then(parseForecastTimeAndItems)
    .then(function(forecastTimeAndItems) {
      forecastTimeAndItems.forecastItems = getForecastItemsAfterStartTime(forecastTimeAndItems.forecastItems)
      return forecastTimeAndItems
    })

  function getForecastItemsAfterStartTime(forecastItems) {
    return forecastItems.filter(item => moment(item.time).isAfter(moment(startTime)))
  }
}


/*
  For forecast format see ForecastItem
 */
function parseForecastTimeAndItems(gribGetOutput: string) {
  const lines = gribGetOutput.split(/\n/).filter(line => line.trim() !== '')
  const rawGribData: RawGribDatum[] = lines.map(parseGribLine)
  const gribDataGroupedByTime: RawGribDatum[][] = _.values(_.groupBy(rawGribData, datum => datum.time.getTime()))
  const forecastItems = gribDataGroupedByTime.map(createForecastItem)
  const sortedForecastItems = _.sortBy(forecastItems, item => item.time)

  return { forecastTime: sortedForecastItems[0].time, forecastItems: sortedForecastItems }


  interface RawGribDatum {
    name: string,
    time: Date,
    value: number
  }

  function parseGribLine(line) {
    const parts = line.split(/ /).filter(line => line.trim() !== '')

    const datumName = parts[0]
    const date = parts[1]
    const time = parts[2]
    const timeIncrement = parts[3]
    const datumValue = parseFloat(parts[4])

    return {
      name: datumName,
      time: utils.parseHourlyTimestampFromGribItemDateAndTime(date, time).clone().add(timeIncrement, 'h').toDate(),
      value: datumValue
    }
  }

  function createForecastItem(dataForOneMoment: RawGribDatum[]): ForecastItem {
    const combinedItem = _.assign({}, ...dataForOneMoment.map(createParsedDatum)) as { '10v': number, '10u': number, msl: number, prate: number, time: Date }

    const wind = new Victor(combinedItem['10v'], combinedItem['10u'])
    const windSpeedMs = +wind.length().toFixed(1)
    const windDir = Math.round(wind.horizontalAngleDeg() + 180)
    const pressureMbar = +(combinedItem.msl / 100).toFixed(1)

    return {
      prate: combinedItem.prate,
      windSpeedMs,
      windDir,
      pressureMbar,
      time: combinedItem.time
    }

    function createParsedDatum(datum: RawGribDatum) {
      return { time: datum.time, [datum.name]: datum.value }
    }
  }
}

module.exports = {
  getForecastItemsFromGrib: getForecastItemsFromGrib
}