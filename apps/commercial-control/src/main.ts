import { startBranchService } from '@durable-jev/branch-service'

await startBranchService({
  serviceName: 'commercial-control',
  branches: ['commercial'],
  defaultPort: 4130,
})
