// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { describe, expect, it } from 'vitest'
import { defaultAppointment, doctors, pets, roles, visits } from '../src/data'

describe('seed data', () => {
  it('keeps the default appointment aligned with available doctors and pets', () => {
    expect(doctors.map((doctor) => doctor.name)).toContain(defaultAppointment.doctor)
    expect(pets.map((pet) => pet.name)).toContain(defaultAppointment.pet)
  })

  it('provides role, pet, and visit data for the prototype screens', () => {
    expect(roles).toHaveLength(3)
    expect(pets.length).toBeGreaterThanOrEqual(4)
    expect(visits.length).toBeGreaterThanOrEqual(3)
  })
})
