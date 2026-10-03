export type Coordinates = {
  latitude: number
  longitude: number
}

export function getCurrentLocation(): Promise<Coordinates> {
  if (!navigator.geolocation) {
    return Promise.reject(new Error('Location is not supported by this browser.'))
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({
        latitude: Number(coords.latitude.toFixed(3)),
        longitude: Number(coords.longitude.toFixed(3)),
      }),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new Error('Location permission was denied. Allow location access and try again.'))
        } else if (error.code === error.TIMEOUT) {
          reject(new Error('Could not get your location in time. Please try again.'))
        } else {
          reject(new Error('Your location is unavailable. Check your device settings and try again.'))
        }
      },
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 12_000 },
    )
  })
}

export function distanceInKm(from: Coordinates, to: Coordinates): number {
  const toRadians = (degrees: number) => degrees * (Math.PI / 180)
  const latitudeDelta = toRadians(to.latitude - from.latitude)
  const longitudeDelta = toRadians(to.longitude - from.longitude)
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude))
    * Math.sin(longitudeDelta / 2) ** 2

  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
