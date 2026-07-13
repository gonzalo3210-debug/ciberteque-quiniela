import { useState, useEffect } from 'react'

export function useCuentaRegresiva(fechaCierre: string | null) {
  const [textoCuenta, setTextoCuenta] = useState('')
  const [esUrgente, setEsUrgente] = useState(false)
  const [yaCerro, setYaCerro] = useState(false)

  useEffect(() => {
    if (!fechaCierre) {
      setTextoCuenta('')
      return
    }

    const fechaCierreMs = new Date(fechaCierre).getTime()

    const actualizarReloj = () => {
      const ahora = new Date().getTime()
      const diferencia = fechaCierreMs - ahora

      if (diferencia <= 0) {
        setTextoCuenta('CERRADA')
        setYaCerro(true)
        setEsUrgente(true)
        return
      }

      const horas = Math.floor(diferencia / (1000 * 60 * 60))
      const minutos = Math.floor((diferencia % (1000 * 60 * 60)) / (1000 * 60))
      const segundos = Math.floor((diferencia % (1000 * 60)) / 1000)

      setYaCerro(false)

      if (horas < 24) {
        // Formato FOMO (Fear Of Missing Out) con cuenta regresiva exacta
        setEsUrgente(true)
        setTextoCuenta(`Cierra en ${horas}h ${minutos}m ${segundos}s`)
      } else {
        // Formato relajado para quinielas a largo plazo
        setEsUrgente(false)
        const dias = Math.floor(horas / 24)
        const horasRestantes = horas % 24
        setTextoCuenta(`Cierra en ${dias}d ${horasRestantes}h`)
      }
    }

    actualizarReloj() 
    const intervalo = setInterval(actualizarReloj, 1000)

    return () => clearInterval(intervalo)
  }, [fechaCierre])

  return { textoCuenta, esUrgente, yaCerro }
}