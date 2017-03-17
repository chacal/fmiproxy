import requestP = require('request-promise')
var _ = require('lodash')
var geolib = require('geolib')
var moment = require('moment')
import utils = require('./utils')
var logger = require('./logging.js').console
var xpath = require('xpath')
import { DOMParser } from 'xmldom'
import R = require('ramda')
import {ObservationStation, NearestObservationStation} from "./ForecastDomain"
import Bluebird = require("bluebird")

let observationStations: ObservationStation[] = []

export function init(apiKey): Bluebird<void> {
  logger.info("Updating observation station cache..")
  var lastFullHour = moment().minutes(0).seconds(0).utc().format("YYYY-MM-DDTHH:mm:ss") + "Z"
  var observationsUrl = 'http://data.fmi.fi/fmi-apikey/' + apiKey + '/wfs?request=getFeature&storedquery_id=fmi::forecast::hirlam::surface::obsstations::multipointcoverage&parameters=temperature&starttime=' + lastFullHour + '&endtime=' + lastFullHour

  return requestP.get(observationsUrl)
    .then(body => {
      const doc = new DOMParser().parseFromString(body.toString())
      const select = xpath.useNamespaces({
        target: 'http://xml.fmi.fi/namespace/om/atmosphericfeatures/1.0',
        gml: 'http://www.opengis.net/gml/3.2',
        xlink: 'http://www.w3.org/1999/xlink'
      })
      const locationNodes: any[] = select("//target:Location", doc)
      return locationNodes.map(createObservationStation)

      function createObservationStation(locationNode): ObservationStation {
        const name: string = select('./gml:name[@codeSpace="http://xml.fmi.fi/namespace/locationcode/name"]/text()', locationNode).toString()
        const geoid: string = select('./gml:name[@codeSpace="http://xml.fmi.fi/namespace/locationcode/geoid"]/text()', locationNode).toString()
        const poinRef = select('./target:representativePoint/@xlink:href', locationNode, true).value.substr(1)
        const position = select('//gml:Point[@gml:id="' + poinRef + '"]/gml:pos/text()', doc, true).toString()
        const {lat, lng} = utils.locationFromPositionString(position)
        return {geoid, name, lat, lng}
      }
    })
    .then(stations => {
      observationStations = stations
      logger.info("Loaded " + stations.length + " observation stations.")
    })
}

function getNearestStation(latitude: number, longitude: number): NearestObservationStation {
  const nearest = geolib.findNearest({latitude, longitude}, observationStations)
  return R.merge({ distanceMeters: nearest.distance }, observationStations[nearest.key] as any)
}

module.exports = {
  init: init,
  getNearestStation: getNearestStation
}
