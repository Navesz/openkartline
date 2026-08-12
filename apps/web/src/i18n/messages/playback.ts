import { defineMessages } from '../locales'

export const playback = defineMessages({
  'playback.sectionAria': { en: 'Lap playback', 'pt-BR': 'Reprodução da volta' },
  'playback.pause': { en: 'Pause playback', 'pt-BR': 'Pausar reprodução' },
  'playback.play': { en: 'Play lap', 'pt-BR': 'Reproduzir volta' },
  'playback.resetAria': { en: 'Back to start', 'pt-BR': 'Voltar para a largada' },
  'playback.resetTitle': { en: 'Back to start', 'pt-BR': 'Voltar à largada' },
  'playback.rateGroupAria': { en: 'Playback speed', 'pt-BR': 'Velocidade de reprodução' },
  'playback.scrubLabel': { en: 'Position in the lap', 'pt-BR': 'Posição na volta' },
  'playback.simulatedNote': {
    en: 'simulated lap · {rate}x replay takes {seconds} s',
    'pt-BR': 'volta simulada · reprodução {rate}x leva {seconds} s',
  },
  'playback.pedalThrottle': { en: 'THR', 'pt-BR': 'ACEL' },
  'playback.pedalBrake': { en: 'BRK', 'pt-BR': 'FREIO' },
  'playback.modeBrake': { en: 'BRAKING', 'pt-BR': 'FREANDO' },
  'playback.modeCoast': { en: 'COASTING', 'pt-BR': 'INÉRCIA' },
  'playback.modeThrottle': { en: 'ON THROTTLE', 'pt-BR': 'ACELERANDO' },
})
