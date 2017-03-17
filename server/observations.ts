import {StationObservation, ObservationItem} from "./ForecastDomain"
import utils = require('./utils')
import L = require('partial.lenses')
import R = require('ramda')
import * as Bluebird from "bluebird"

module.exports = function(apiKey) {
  const baseUrl = 'http://data.fmi.fi/fmi-apikey/' + apiKey + '/wfs?request=getFeature&storedquery_id=fmi::observations::weather::multipointcoverage&parameters=temperature,windspeedms,windgust,winddirection,pressure'

  const observationUrlForGeoid = geoid => baseUrl + '&geoid=' + geoid
  const observationUrlForPlace = place => baseUrl + '&place=' + place

  return {

    getObservationsForGeoid: (geoid: string): Bluebird<StationObservation> => utils.getFmiXMLasJson(observationUrlForGeoid(geoid)).then(parseStationObservation),
    getObservationsForPlace: (place: string): Bluebird<StationObservation> => utils.getFmiXMLasJson(observationUrlForPlace(place)).then(parseStationObservation)

  }

  function parseStationObservation(json: any): StationObservation {
    const gridSeriesObservation = L.get(['wfs:FeatureCollection', 'wfs:member', 0, 'omso:GridSeriesObservation', 0], json)
    const geoid = getGeoidFromGridSeriesObservation(gridSeriesObservation)

    const gmlPoint = L.get(['om:featureOfInterest', 0, 'sams:SF_SpatialSamplingFeature', 0, 'sams:shape', 0, 'gml:MultiPoint', 0, 'gml:pointMember', 0, 'gml:Point', 0], gridSeriesObservation)
    const stationInfo = getStationInfoFromGmlPoint(gmlPoint)

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

    function getGeoidFromGridSeriesObservation(gridSeriesObservation: any): string {
      return L.get(['om:featureOfInterest', 0, 'sams:SF_SpatialSamplingFeature', 0,
          'sam:sampledFeature', 0, 'target:LocationCollection', 0, 'target:member', 0,
          'target:Location', 0, 'gml:name',
          L.find(gmlName => gmlName['$'].codeSpace === 'http://xml.fmi.fi/namespace/locationcode/geoid'),
          '_'],
        gridSeriesObservation)
    }

    function getStationInfoFromGmlPoint(gmlPoint: any): any {
      const name = gmlPoint['gml:name'][0]
      const position = gmlPoint['gml:pos'][0].trim()
      return R.merge({ name }, utils.locationFromPositionString(position) as any)
    }

    function trimmedLines(input: string): string[] { return input.trim().split(/\n/).map(line => line.trim()) }
  }
}