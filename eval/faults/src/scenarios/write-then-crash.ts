// Child process for F02: makes the reservation, then dies before anyone hears about it.
import { loadCase } from '@durable-jev/eval-runner'
import { openDatabase } from '@durable-jev/store'
import { ensurePlanReservation, reservationMigrations } from '@durable-jev/transport-reservations'

const [databasePath = ''] = process.argv.slice(2)
const database = openDatabase(databasePath, reservationMigrations)
ensurePlanReservation(database, loadCase('LOG-001').shipment)
database.close()
process.exit(137)
