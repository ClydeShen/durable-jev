import { startBranchService } from '@durable-jev/branch-service'

await startBranchService({
  serviceName: 'cargo-assurance',
  branches: ['controlled', 'coldChain'],
  defaultPort: 4110,
})
