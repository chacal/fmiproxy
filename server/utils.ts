import {ForecastItem, PointForecast} from "./ForecastDomain"
var BPromise = require('bluebird')
var request = BPromise.promisifyAll(require('request'))
var xml2js = BPromise.promisifyAll(require('xml2js'))
var child_process = require('child_process')
var _ = require('lodash')
var moment = require('moment')
import L = require('partial.lenses')
import R = require('ramda')

function grib_get(params) {
  return new BPromise(function (resolve, reject) {
    var grib_get = child_process.spawn('grib_get', params)
    var output = ""
    var errorOutput = ""

    grib_get.on('error', function(err) { reject(err) })
    grib_get.on('close', function(code) {
      if(code === 0) {
        resolve(output)
      } else {
        reject({message: 'grib_get exited with error ' + code + ':\n' + errorOutput})
      }
    })
    grib_get.stderr.on('data', function(chunk) { errorOutput = errorOutput + chunk })
    grib_get.stdout.on('data', function(chunk) { output = output + chunk })
  })
}

export function getFmiXMLasJson(url) {
  return request.getAsync(url)
    .then(function(res) {
      return xml2js.parseStringAsync(res.body)
    })
}

function getStationInfoFromGmlPoint(gmlPoint) {
  var name = gmlPoint['gml:name'][0]
  var position = gmlPoint['gml:pos'][0].trim()
  return _.extend({ name: name }, locationFromPositionString(position))
}

function getGeoidFromGridSeriesObservation(gridSeriesObservation) {
  var pathStart = 'om:featureOfInterest[0].sams:SF_SpatialSamplingFeature[0]'
  var gmlNames = _.get(gridSeriesObservation, pathStart + '.sam:sampledFeature[0].target:LocationCollection[0].target:member[0].target:Location[0].gml:name')
  return _.find(gmlNames, function(name) { return _.get(name, '$.codeSpace') === 'http://xml.fmi.fi/namespace/locationcode/geoid' })._
}

export function locationFromPositionString(position): {latitude: number, longitude: number} {  // TODO: Better type
  var position = position.trim()
  var latitude = position.substr(0, position.indexOf(' '))
  var longitude = position.trim().substr(position.indexOf(' ') + 1)
  return { latitude: parseFloat(latitude), longitude: parseFloat(longitude) }
}

export function parseHourlyTimestampFromGribItemDateAndTime(date, time) {
  // Return timestamp with one hour precision (ignores minutes)
  // Works correctly for time inputs: '0', '12', '600', '1600', '1230'
  // Assumes that the date & time are given in GMT time zone
  var time = (time.length === 1 || time.length === 3) ? '0' + time : time
  return moment(date + time + '+0000', 'YYYYMMDDHHZ')
}

export function removeOlderForecastItems(forecast: PointForecast, time: Date): PointForecast {
  return L.remove(['forecastItems', L.elems, L.when(isItemBeforeStartTime)], forecast)

  function isItemBeforeStartTime(item: ForecastItem) {
    return moment(item.time).isBefore(moment(time))
  }
}

export function rangeStep(start: number, stop: number, step: number = 1): number[] {
  return R.map(
    n => start + step * n,
    R.range(0, (1 + (stop - start) / step) >>> 0)
  )
}


module.exports = {
  grib_get: grib_get,
  getFmiXMLasJson,
  getStationInfoFromGmlPoint: getStationInfoFromGmlPoint,
  getGeoidFromGridSeriesObservation: getGeoidFromGridSeriesObservation,
  locationFromPositionString,
  parseHourlyTimestampFromGribItemDateAndTime,
  removeOlderForecastItems,
  rangeStep
}