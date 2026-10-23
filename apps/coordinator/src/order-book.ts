import { type Shipment, shipmentSchema } from '@durable-jev/contracts'
import { type Db, type Migration, migrate, openDatabase } from '@durable-jev/store'

const orderBookMigrations: readonly Migration[] = [
  {
    version: 1,
    name: 'orders entered in the console',
    sql: `
      CREATE TABLE orders (
        case_id TEXT PRIMARY KEY,
        shipment_json TEXT NOT NULL
      );
    `,
  },
]

/** The orders entered in the console, as first submitted, so a case can start over from them. */
export class OrderBook {
  private constructor(private readonly db: Db) {}

  static open(path: string): OrderBook {
    const db = openDatabase(path)
    migrate(db, orderBookMigrations)
    return new OrderBook(db)
  }

  put(shipment: Shipment) {
    this.db
      .prepare('INSERT INTO orders (case_id, shipment_json) VALUES (?, ?)')
      .run(shipment.caseId, JSON.stringify(shipment))
  }

  original(caseId: string): Shipment | undefined {
    const row = this.db
      .prepare<[string], { shipment_json: string }>(
        'SELECT shipment_json FROM orders WHERE case_id = ?',
      )
      .get(caseId)
    return row && shipmentSchema.parse(JSON.parse(row.shipment_json))
  }

  clear() {
    this.db.exec('DELETE FROM orders')
  }
}
