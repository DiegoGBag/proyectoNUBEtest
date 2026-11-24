import { useEffect, useState } from 'react'
import { fetchEventPhoto } from './api'

// Muestra la foto guardada de un evento (la descarga con el token de sesion).
// No pinta nada si el evento no tiene foto.
function EventPhoto({ eventId, hasPhoto, alt = '', className }) {
  const [src, setSrc] = useState(null)

  useEffect(() => {
    if (!hasPhoto) return undefined
    let cancelled = false
    let objectUrl = null
    fetchEventPhoto(eventId)
      .then((url) => {
        if (cancelled) {
          if (url) URL.revokeObjectURL(url)
          return
        }
        objectUrl = url
        setSrc(url)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [eventId, hasPhoto])

  if (!hasPhoto || !src) return null
  return <img className={className} src={src} alt={alt} loading="lazy" />
}

export default EventPhoto
