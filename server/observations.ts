import {StationObservation, ObservationItem} from "./ForecastDomain"
var utils = require('./utils')
import L = require('partial.lenses')
import R = require('ramda')

module.exports = function(apiKey) {
  var baseUrl = 'http://data.fmi.fi/fmi-apikey/' + apiKey + '/wfs?request=getFeature&storedquery_id=fmi::observations::weather::multipointcoverage&parameters=temperature,windspeedms,windgust,winddirection,pressure'

  function observationUrlForGeoid(geoid) { return baseUrl + '&geoid=' + geoid }
  function observationUrlForPlace(place) { return baseUrl + '&place=' + place }

  return {

    getObservationsForGeoid: function(geoid) {
      return utils.getFmiXMLasJson(observationUrlForGeoid(geoid)).then(parseStationObservation)
    },

    getObservationsForPlace: function(place) {
      return utils.getFmiXMLasJson(observationUrlForPlace(place)).then(parseStationObservation)
    }

  }

  function parseStationObservation(json: any): StationObservation {
    const gridSeriesObservation = L.get(['wfs:FeatureCollection', 'wfs:member', 0, 'omso:GridSeriesObservation', 0], json)
    const geoid = utils.getGeoidFromGridSeriesObservation(gridSeriesObservation)

    const gmlPoint = L.get(['om:featureOfInterest', 0, 'sams:SF_SpatialSamplingFeature', 0, 'sams:shape', 0, 'gml:MultiPoint', 0, 'gml:pointMember', 0, 'gml:Point', 0], gridSeriesObservation)
    const stationInfo = utils.getStationInfoFromGmlPoint(gmlPoint)

    const pathStart = ['om:result', 0, 'gmlcov:MultiPointCoverage', 0]
    const values = L.get([pathStart, 'gml:rangeSet', 0, 'gml:DataBlock', 0, 'gml:doubleOrNilReasonTupleList', 0], gridSeriesObservation)
    const metadata = L.get([pathStart, 'gml:domainSet', 0, 'gmlcov:SimpleMultiPoint', 0, 'gmlcov:positions', 0], gridSeriesObservation)

    const dataLines = trimmedLines(values)
    const metadataLines = trimmedLines(metadata)
    const observationLines = R.zipWith((a,b) => a + ' ' + b, dataLines, metadataLines)

    const observations = observationLines.map(parseObservationItem)

    return {
      station: R.merge(stationInfo, {geoid}),
      observations
    }

    function parseObservationItem(observationLine: string): ObservationItem {
      const parts = observationLine.split(/ /).filter(part => part.trim() !== '')
      return {
        temperature: parseFloat(parts[0]),
        windSpeedMs: parseFloat(parts[1]),
        windGustMs: parseFloat(parts[2]),
        windDir: Math.round(parseFloat(parts[3])),
        pressureMbar: parseFloat(parts[4]),
        time: new Date(parseInt(parts[7]) * 1000)
      }
    }

    function trimmedLines(input: string): string[] { return input.trim().split(/\n/).map(line => line.trim()) }
  }
}