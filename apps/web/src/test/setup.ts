import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)

Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:openkartline-test', configurable: true })
Object.defineProperty(URL, 'revokeObjectURL', { value: () => undefined, configurable: true })
