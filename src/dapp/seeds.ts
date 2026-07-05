// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import type { ComplaintTemplate, DappCollections, DrugGroup, DrugRecord, DrugTemplate } from "./types";

export const seedComplaintTemplates: ComplaintTemplate[] = [
  {
    id: "what-happened-tree",
    title: "Что случилось",
    mode: "hierarchical",
    prompt: "Выберите вариант или дополните описание своими словами.",
    options: [
      { id: "ok", label: "Все хорошо" },
      {
        id: "problem",
        label: "Есть проблемы",
        children: [
          {
            id: "behavior",
            label: "С поведением",
            children: [
              { id: "low-activity", label: "Снижение активности" },
              { id: "anxiety", label: "Беспокойство" },
              { id: "appetite", label: "Изменение аппетита" },
            ],
          },
          {
            id: "general",
            label: "С общим самочувствием",
            children: [
              { id: "fever", label: "Температура" },
              { id: "weakness", label: "Слабость" },
              { id: "pain", label: "Боль" },
            ],
          },
          {
            id: "skin",
            label: "С кожными покровами",
            children: [
              { id: "itch", label: "Зуд" },
              { id: "rash", label: "Высыпания" },
              { id: "hair-loss", label: "Выпадение шерсти" },
            ],
          },
          {
            id: "digestion",
            label: "С пищеварением",
            children: [
              { id: "vomiting", label: "Рвота" },
              { id: "diarrhea", label: "Диарея" },
              { id: "constipation", label: "Запор" },
            ],
          },
          {
            id: "breathing",
            label: "С дыханием",
            children: [
              { id: "cough", label: "Кашель" },
              { id: "shortness", label: "Одышка" },
              { id: "nasal", label: "Выделения из носа" },
            ],
          },
          {
            id: "urinary",
            label: "С мочеполовой системой",
            children: [
              { id: "frequent", label: "Частое мочеиспускание" },
              { id: "painful", label: "Болезненность" },
              { id: "discharge", label: "Выделения" },
            ],
          },
          {
            id: "support",
            label: "С опороспособностью",
            children: [
              { id: "limp", label: "Хромота" },
              { id: "refusal", label: "Не наступает на лапу" },
              { id: "stiffness", label: "Скованность" },
            ],
          },
          {
            id: "trauma",
            label: "Травма",
            children: [
              { id: "wound", label: "Рана" },
              { id: "fall", label: "Падение" },
              { id: "bite", label: "Укус" },
            ],
          },
          {
            id: "vision",
            label: "Со зрением",
            children: [
              { id: "redness", label: "Покраснение" },
              { id: "squint", label: "Щурится" },
              { id: "discharge-eye", label: "Выделения из глаз" },
            ],
          },
        ],
      },
      {
        id: "critical",
        label: "Все очень плохо",
        children: [
          { id: "collapse", label: "Потеря сознания" },
          { id: "bleeding", label: "Кровотечение" },
          { id: "seizure", label: "Судороги" },
        ],
      },
    ],
  },
  {
    id: "what-happened-free",
    title: "Что случилось: текст",
    mode: "freeText",
    prompt: "Опишите состояние питомца свободным текстом.",
    options: [],
  },
];

export const seedDrugTemplates: DrugTemplate[] = [
  {
    id: "drug-template-default",
    title: "Шаблон препарата",
    description: "Структура справочной записи по действующему веществу.",
    fields: [
      { id: "activeSubstanceRu", label: "Действующее вещество по-русски", required: true },
      { id: "activeSubstanceLatin", label: "Действующее вещество на латинском" },
      { id: "tradeNames", label: "Торговые названия", multiline: true },
      { id: "pharmacokinetics", label: "Фармакокинетика", multiline: true },
      { id: "pharmacodynamics", label: "Фармакодинамика", multiline: true },
      { id: "dogDoseText", label: "Дозы, способы введения и кратность для собак", multiline: true },
      { id: "dogDoseSource", label: "Источник для собак", multiline: true },
      { id: "catDoseText", label: "Дозы, способы введения и кратность для кошек", multiline: true },
      { id: "catDoseSource", label: "Источник для кошек", multiline: true },
    ],
  },
];

export const seedDrugGroups: DrugGroup[] = [
  {
    id: "drug-group-analgesics",
    title: "Обезболивающие",
    sortOrder: 10,
  },
];

export const seedDrugRecords: DrugRecord[] = [
  {
    id: "drug-paracetamol",
    templateId: "drug-template-default",
    templateTitle: "Шаблон препарата",
    activeSubstanceRu: "Парацетамол",
    activeSubstanceLatin: "Paracetamolum",
    pharmacyType: "human",
    groupIds: ["drug-group-analgesics"],
    tradeNames: [],
    pharmacokinetics: "",
    pharmacodynamics: "",
    dogDose: { text: "", source: "" },
    catDose: { text: "", source: "" },
    createdAt: "2026-06-22T21:03:28.000Z",
    updatedAt: "2026-06-22T21:03:28.000Z",
  },
  {
    id: "drug-meloxicam",
    templateId: "drug-template-default",
    templateTitle: "Шаблон препарата",
    activeSubstanceRu: "Мелоксикам",
    activeSubstanceLatin: "Meloxicamum",
    pharmacyType: "vet",
    groupIds: ["drug-group-analgesics"],
    tradeNames: [],
    pharmacokinetics: "",
    pharmacodynamics: "",
    dogDose: { text: "", source: "" },
    catDose: { text: "", source: "" },
    createdAt: "2026-06-22T21:03:28.000Z",
    updatedAt: "2026-06-22T21:03:28.000Z",
  },
];

export function createSeedCollections(): DappCollections {
  return {
    complaintTemplates: seedComplaintTemplates,
    complaintRecords: [],
    drugGroups: seedDrugGroups,
    drugTemplates: seedDrugTemplates,
    drugRecords: seedDrugRecords,
  };
}
