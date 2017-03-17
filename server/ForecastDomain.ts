export interface AreaForecast {
  publishTime: Date,
  pointForecasts: PointForecast[]
}

export interface PointForecast extends Coords {
  publishTime: Date,
  forecastItems: ForecastItem[]
}

export interface ForecastItem {
  prate: number,
  windSpeedMs: number,
  windDir: number,
  pressureMbar: number,
  time: Date
}

export interface Bounds {
  swCorner: Coords,
  neCorner: Coords
}

export interface Coords {
  lat: number,
  lng: number
}

export interface ObservationStation extends Coords {
  geoid: string,
  name: string
}

export interface NearestObservationStation extends ObservationStation {
  distanceMeters: number
}