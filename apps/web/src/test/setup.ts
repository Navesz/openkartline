import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)

Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:openkartline-test', configurable: true })
Object.defineProperty(URL, 'revokeObjectURL', { value: () => undefined, configurable: true })

// jsdom's File has no `text()`, so every import path -- which starts with
// `await file.text()` -- fails with "file.text is not a function" before the
// code under test runs. Reading the blob is the behaviour the browser
// provides; supplying it here tests the app rather than the environment.
if (typeof File !== 'undefined' && typeof File.prototype.text !== 'function') {
  Object.defineProperty(File.prototype, 'text', {
    configurable: true,
    value(this: File) {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsText(this)
      })
    },
  })
}
