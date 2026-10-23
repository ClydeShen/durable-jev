/** The reference choices an order is entered with: who orders it, who carries it, and where. */
export interface OrderOptions {
  customers: { customerId: string; name: string; restrictions: string }[]
  carriers: { carrierId: string; name: string }[]
  vehicles: { vehicleId: string; carrierId: string; temperatureControlled: boolean }[]
  locations: string[]
}
