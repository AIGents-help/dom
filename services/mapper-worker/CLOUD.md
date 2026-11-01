# DOMINIC Cloud Mapper deployment

This is the deployment-ready Docker Compose packaging for the existing NodeODM + DOM Mapper worker. It is **not** a live cloud service and **not** serverless billing. A cloud provider must host a Linux VM and charge for its uptime and storage. Never set it up on a Vercel web function.

## Before deployment

1. Choose a suitable private Linux VM with generous RAM (64 GB recommended for the initial 159-image flight), SSD scratch space, outbound HTTPS, and Docker Engine + Docker Compose.
2. Place the DOM repository on the VM using an authenticated Git checkout, and copy `.env.cloud.example` to `.env.cloud` in `services/mapper-worker`.
3. Add the actual **Supabase service-role key** directly to the VM's secret file, with owner-only file permissions. Do not paste it into a browser, Vercel public variable, or GitHub.
4. From `services/mapper-worker`, run `docker compose -f cloud.compose.yml up -d --build`. Then inspect `docker compose -f cloud.compose.yml logs -f worker`.
5. Validate worker connection before queueing a real job; worker automatically claims any eligible queued job in the shared Supabase queue.
6. Queue one Quick Test or Standard Orthomosaic in DOMINIC, observe progress, and verify a GeoTIFF deliverable before considering this production-ready.

**Security:** NodeODM port 3000 is exposed only to its private Compose network, not to the public Internet. The worker uses a privileged Supabase key, so only install it on a trusted VM. Cloud provider secret injection is preferred over a plaintext environment file when available.

**Costs:** A persistent VM incurs charges even without mapping jobs. The next infrastructure milestone is provider-specific lifecycle automation to start/stop the VM around jobs, plus cost ceilings. Do not advertise automatic pay-per-job compute until those controls exist.

**Data:** Local scratch directories are wiped after the job; output files remain in Supabase/optional Drive. Cloud VM disks and backups have independent costs. Avoid sending industrial-client imagery to a third party before customer authorization.

**Troubleshooting:** If no job is claimed, inspect the worker logs and Supabase `mapping_processing_jobs` state. If a job cannot complete, inspect NodeODM task logs and memory before increasing quality settings.
