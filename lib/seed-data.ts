import type {
  ContingencyOption,
  PricingItem,
  PricingLevel
} from "@/lib/types";

export const pricingItems: PricingItem[] = [
  {
    id: "base-cost-per-sqft",
    category: "Base",
    name: "Cost per Sq Ft",
    unitType: "per_sqft",
    basePriceCents: 600,
    active: true,
    sortOrder: 1
  },
  {
    id: "lighting-recessed-led-wafer",
    category: "Lighting",
    name: "Recessed LED Wafer",
    unitType: "per_unit",
    basePriceCents: 10000,
    active: true,
    sortOrder: 2
  },
  {
    id: "lighting-6in-disk-light",
    category: "Lighting",
    name: "6in Disk Light",
    unitType: "per_unit",
    basePriceCents: 5500,
    active: true,
    sortOrder: 3
  },
  {
    id: "lighting-10in-disk-light",
    category: "Lighting",
    name: "10in Disk Light",
    unitType: "per_unit",
    basePriceCents: 7500,
    active: true,
    sortOrder: 4
  },
  {
    id: "lighting-pendant-light",
    category: "Lighting",
    name: "Pendant Light",
    unitType: "per_unit",
    basePriceCents: 7500,
    active: true,
    sortOrder: 5
  },
  {
    id: "lighting-flood-light",
    category: "Lighting",
    name: "Flood Light",
    unitType: "per_unit",
    basePriceCents: 20000,
    active: true,
    sortOrder: 6
  },
  {
    id: "lighting-under-cabinet-light",
    category: "Lighting",
    name: "Under Cabinet Light",
    unitType: "per_unit",
    basePriceCents: 20000,
    active: true,
    sortOrder: 7
  },
  {
    id: "lighting-upper-cabinet-light",
    category: "Lighting",
    name: "Upper Cabinet Light",
    unitType: "per_unit",
    basePriceCents: 12500,
    active: true,
    sortOrder: 8
  },
  {
    id: "lighting-exterior-soffit-light",
    category: "Lighting",
    name: "Exterior Soffit Light",
    unitType: "per_unit",
    basePriceCents: 12500,
    active: true,
    sortOrder: 9
  },
  {
    id: "lighting-extra-exterior-bracket-light",
    category: "Lighting",
    name: "Extra Exterior Bracket Light",
    unitType: "per_unit",
    basePriceCents: 10000,
    active: true,
    sortOrder: 10
  },
  {
    id: "lighting-extra-sconce-light",
    category: "Lighting",
    name: "Extra Sconce Light",
    unitType: "per_unit",
    basePriceCents: 7500,
    active: true,
    sortOrder: 11
  },
  {
    id: "lighting-step-light",
    category: "Lighting",
    name: "Step Light",
    unitType: "per_unit",
    basePriceCents: 9000,
    active: true,
    sortOrder: 12
  },
  {
    id: "outlets-extra-outlet",
    category: "Outlets",
    name: "Extra Outlet",
    unitType: "per_unit",
    basePriceCents: 5000,
    active: true,
    sortOrder: 13
  },
  {
    id: "outlets-outdoor-outlet",
    category: "Outlets",
    name: "Outdoor Outlet",
    unitType: "per_unit",
    basePriceCents: 7500,
    active: true,
    sortOrder: 14
  },
  {
    id: "outlets-floor-plug",
    category: "Outlets",
    name: "Floor Plug",
    unitType: "per_unit",
    basePriceCents: 30000,
    active: true,
    sortOrder: 15
  },
  {
    id: "circuits-dedicated-20a-circuit",
    category: "Circuits",
    name: "Dedicated 20A Circuit",
    unitType: "per_unit",
    basePriceCents: 30000,
    active: true,
    sortOrder: 16
  },
  {
    id: "circuits-additional-washer-circuit",
    category: "Circuits",
    name: "Additional Washer Circuit",
    unitType: "per_unit",
    basePriceCents: 35000,
    active: true,
    sortOrder: 17
  },
  {
    id: "circuits-additional-dryer-circuit",
    category: "Circuits",
    name: "Additional Dryer Circuit",
    unitType: "per_unit",
    basePriceCents: 60000,
    active: true,
    sortOrder: 18
  },
  {
    id: "circuits-additional-oven-cooktop",
    category: "Circuits",
    name: "Additional Oven/Cooktop",
    unitType: "per_unit",
    basePriceCents: 80000,
    active: true,
    sortOrder: 19
  },
  {
    id: "panels-400-amp-service",
    category: "Panels & Service",
    name: "400 Amp Service",
    unitType: "flat",
    basePriceCents: 180000,
    active: true,
    sortOrder: 20
  },
  {
    id: "panels-extra-125-amp-sub-panel",
    category: "Panels & Service",
    name: "Extra 125 Amp Sub Panel",
    unitType: "flat",
    basePriceCents: 150000,
    active: true,
    sortOrder: 21
  },
  {
    id: "panels-extra-200-amp-outdoor-panel",
    category: "Panels & Service",
    name: "Extra 200 Amp Outdoor Panel Beside Meter",
    unitType: "flat",
    basePriceCents: 140000,
    active: true,
    sortOrder: 22
  },
  {
    id: "panels-200-amp-meter-panel-combo",
    category: "Panels & Service",
    name: "200 Amp Meter/Panel Combo",
    unitType: "flat",
    basePriceCents: 95000,
    active: true,
    sortOrder: 23
  },
  {
    id: "garage-3-car-garage",
    category: "Garage",
    name: "3 Car Garage",
    unitType: "flat",
    basePriceCents: 125000,
    active: true,
    sortOrder: 24
  },
  {
    id: "ev-60-amp-car-charger",
    category: "EV",
    name: "60 Amp Car Charger",
    unitType: "flat",
    basePriceCents: 150000,
    active: true,
    sortOrder: 25
  },
  {
    id: "generator-30-amp-generator-plug",
    category: "Generator",
    name: "30 Amp Generator Plug",
    unitType: "flat",
    basePriceCents: 85000,
    active: true,
    sortOrder: 26
  },
  {
    id: "generator-50-amp-generator-plug",
    category: "Generator",
    name: "50 Amp Generator Plug",
    unitType: "flat",
    basePriceCents: 100000,
    active: true,
    sortOrder: 27
  },
  {
    id: "generator-200-amp-transfer-switch-owner-provides",
    category: "Generator",
    name: "200 Amp Transfer Switch Install - Owner Provides",
    unitType: "flat",
    basePriceCents: 100000,
    active: true,
    sortOrder: 28
  },
  {
    id: "generator-wire-whole-house-generator",
    category: "Generator",
    name: "Wire Whole House Generator",
    unitType: "flat",
    basePriceCents: 200000,
    active: true,
    sortOrder: 29
  },
  {
    id: "specialty-well-pump",
    category: "Specialty",
    name: "Well Pump",
    unitType: "flat",
    basePriceCents: 30000,
    active: true,
    sortOrder: 30
  },
  {
    id: "specialty-power-for-fireplace",
    category: "Specialty",
    name: "Power for Fireplace",
    unitType: "flat",
    basePriceCents: 12500,
    active: true,
    sortOrder: 31
  },
  {
    id: "basement-unfinished-basement-minimum",
    category: "Basement",
    name: "Unfinished Basement - Minimum",
    unitType: "flat",
    basePriceCents: 95000,
    active: true,
    sortOrder: 32
  },
  {
    id: "fans-porch-ceiling-fan-install",
    category: "Fans",
    name: "Porch Ceiling Fan Install",
    unitType: "per_unit",
    basePriceCents: 15000,
    active: true,
    sortOrder: 33
  },
  {
    id: "fans-high-ceiling-vaulted-ceiling-fixture",
    category: "Fans",
    name: "High Ceiling / Vaulted Ceiling Fixture",
    unitType: "per_unit",
    basePriceCents: 20000,
    active: true,
    sortOrder: 34
  },
  {
    id: "fans-porch-fan-on-vaulted-ceiling",
    category: "Fans",
    name: "Porch Fan on Vaulted Ceiling",
    unitType: "per_unit",
    basePriceCents: 30000,
    active: true,
    sortOrder: 35
  },
  {
    id: "bath-fans-80-cfm-exhaust-fan",
    category: "Bath Fans",
    name: "80 CFM Exhaust Fan",
    unitType: "per_unit",
    basePriceCents: 15000,
    active: true,
    sortOrder: 36
  },
  {
    id: "bath-fans-110-cfm-exhaust-fan",
    category: "Bath Fans",
    name: "110 CFM Exhaust Fan",
    unitType: "per_unit",
    basePriceCents: 20000,
    active: true,
    sortOrder: 37
  },
  {
    id: "bath-fans-110-cfm-exhaust-fan-with-light",
    category: "Bath Fans",
    name: "110 CFM Exhaust Fan with Light",
    unitType: "per_unit",
    basePriceCents: 25000,
    active: true,
    sortOrder: 38
  },
  {
    id: "bath-fans-gfci-protection-over-water",
    category: "Bath Fans",
    name: "GFCI Protection for Exhaust Fan Over Water",
    unitType: "per_unit",
    basePriceCents: 8500,
    active: true,
    sortOrder: 39
  },
  {
    id: "service-work-first-hour",
    category: "Service Work",
    name: "Service Call - First Hour",
    unitType: "flat",
    basePriceCents: 15000,
    active: true,
    sortOrder: 40
  },
  {
    id: "service-work-3-men-1-hour",
    category: "Service Work",
    name: "3 Men - 1 Hour Time and Material",
    unitType: "per_hour",
    basePriceCents: 18500,
    active: true,
    sortOrder: 41
  }
];

export const pricingLevels: PricingLevel[] = [
  {
    id: "contractor-builder",
    name: "Contractor/Builder",
    multiplier: 0.9,
    description: "Builder/spec home discount"
  },
  {
    id: "standard-custom",
    name: "Standard/Custom",
    multiplier: 1,
    description: "Normal custom home pricing"
  },
  {
    id: "premium-high-end",
    name: "Premium/High-End",
    multiplier: 1.2,
    description: "High-end custom, complex selections"
  }
];

export const contingencyOptions: ContingencyOption[] = [
  {
    id: "contingency-0",
    name: "0%",
    multiplier: 1
  },
  {
    id: "contingency-5",
    name: "5%",
    multiplier: 1.05
  },
  {
    id: "contingency-10",
    name: "10%",
    multiplier: 1.1
  },
  {
    id: "contingency-15",
    name: "15%",
    multiplier: 1.15
  }
];

export const projectTypes = [
  "Custom Home",
  "Spec Home",
  "New Build",
  "Remodel",
  "Service Work"
];

export const defaultQuoteNotes =
  "This quote is based on the listed project scope and current material pricing. Additional owner-requested items, scope changes, hidden conditions, and material cost increases may require a written change order or surcharge before work proceeds.";

export const businessInfo = {
  name: "Freedom Family Electric",
  email: "freedomfamilyelectric@gmail.com",
  tagline: "Residential Electrical"
};
