// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import packageJson from '../package.json'
import App from '../src/App.vue'

describe('App', () => {
  it('walks through the auth flow and opens the home screen', async () => {
    const wrapper = mount(App)

    expect(wrapper.text()).toContain('Добро пожаловать!')
    expect(wrapper.text()).toContain('Я - владелец животного')

    await wrapper.get('button.primary-action').trigger('click')
    expect(wrapper.text()).toContain('С возвращением!')

    await wrapper.get('button.primary-action').trigger('click')
    expect(wrapper.text()).toContain('Введите код из СМС')

    await wrapper.get('button.primary-action').trigger('click')
    expect(wrapper.text()).toContain('Добро пожаловать, Даниил!')

    await wrapper.get('button.primary-action').trigger('click')
    expect(wrapper.text()).toContain('Здравствуйте, Даниил !')
    expect(wrapper.text()).toContain('Мои питомцы')
    expect(wrapper.text()).toContain(`Версия ${packageJson.version}`)
  })

  it('filters pets by the search field', async () => {
    const wrapper = mount(App)

    for (let index = 0; index < 4; index += 1) {
      await wrapper.get('button.primary-action').trigger('click')
    }

    const petsTab = wrapper.findAll('button').find((button) => button.text() === 'Питомцы')
    expect(petsTab).toBeDefined()

    await petsTab!.trigger('click')
    await wrapper.get('input[placeholder="Кличка питомца"]').setValue('Чар')

    expect(wrapper.text()).toContain('Чарли')
    expect(wrapper.text()).not.toContain('Шарик')
  })
})
