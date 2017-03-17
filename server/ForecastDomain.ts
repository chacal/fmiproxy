export interface AreaForecast {
  publishTime: Date,
  pointForecasts: PointForecast[]
}

export interface PointForecast {
  publishTime: Date,
  lat: number,
  lng: number,
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

export interface ObservationStation {
  geoid: string,
  name: string,
  latitude: number,
  longitude: number
}