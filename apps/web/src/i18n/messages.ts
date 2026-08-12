import { app } from './messages/app'
import { canvas } from './messages/canvas'
import { imports } from './messages/imports'
import { panel } from './messages/panel'
import { playback } from './messages/playback'
import { presets } from './messages/presets'
import { project } from './messages/project'
import { results } from './messages/results'
import { validation } from './messages/validation'

// Split per screen area so the tables stay reviewable; the keys are namespaced
// so this merge can never silently shadow an entry.
export const MESSAGES = {
  ...app,
  ...canvas,
  ...imports,
  ...panel,
  ...playback,
  ...presets,
  ...project,
  ...results,
  ...validation,
}

export type MessageKey = keyof typeof MESSAGES
