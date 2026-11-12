// A timed-out operation may still be running. The entrypoint must exit on failure.
export async function startupStep(name, operation, { timeoutMs = 30000, log = console.log } = {}) {
  const started = Date.now();
  log(`[startup] ${name}: starting`);
  let timer;
  try {
    const work = Promise.resolve().then(operation);
    const result = timeoutMs > 0 ? await Promise.race([
      work,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`${name} exceeded ${timeoutMs}ms`);
          error.code = "STARTUP_TIMEOUT";
          reject(error);
        }, timeoutMs);
      }),
    ]) : await work;
    log(`[startup] ${name}: complete (${Date.now() - started}ms)`);
    return result;
  } catch (error) {
    // Prisma errors can contain connection URLs. Log only recognized diagnostic codes.
    const code = error?.code || error?.errorCode;
    const safeCode = /^(P\d{4}|E[A-Z]+|STARTUP_TIMEOUT)$/.test(code) ? code : "ERROR";
    log(`[startup] ${name}: failed (${safeCode}, ${Date.now() - started}ms)`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
