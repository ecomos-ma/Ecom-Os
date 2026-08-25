/**
 * AI Provider Abstraction Layer
 * Handles provider selection, health monitoring, and rotation strategies
 */

export enum ProviderState {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  RATE_LIMITED = 'RATE_LIMITED',
  FAILED = 'FAILED',
  DISABLED = 'DISABLED',
  TESTING = 'TESTING'
}

export enum RotationStrategy {
  HEALTH_BASED = 'HEALTH_BASED',
  PRIORITY = 'PRIORITY',
  ROUND_ROBIN = 'ROUND_ROBIN',
  LEAST_USED = 'LEAST_USED'
}

export interface ProviderConfig {
  id: string;
  name: string;
  providerType: string;
  projectId: string;
  modelId: string;
  priority: number;
  capabilities: string[];
  credential: string;
  state: ProviderState;
  cooldownUntil?: Date;
  lastHealthCheck?: Date;
  failureCount: number;
  successCount: number;
  lastUsed?: Date;
}

export interface ProviderMetrics {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  totalTokens: number;
  totalLatency: number;
  averageLatency: number;
}

export interface AIResponse {
  content: string;
  tokens?: {
    input: number;
    output: number;
  };
  model: string;
  provider: string;
}

export interface ProviderCapabilities {
  text: boolean;
  vision: boolean;
  structuredOutput: boolean;
  imageGeneration: boolean;
  audio: boolean;
}

export interface IProvider {
  id: string;
  config: ProviderConfig;
  state: ProviderState;
  metrics: ProviderMetrics;
  
  callAI(prompt: string, options?: any): Promise<AIResponse>;
  healthCheck(): Promise<boolean>;
  getCapabilities(): ProviderCapabilities;
  getState(): ProviderState;
  setState(state: ProviderState): void;
  getMetrics(): ProviderMetrics;
  getSafeConfig(): Omit<ProviderConfig, 'credential'>;
  recordSuccess(latency: number, tokens?: number): void;
  recordFailure(error: any): void;
  resetMetrics(): void;
  isAvailable(): boolean;
  isInCooldown(): boolean;
}

export class BaseProvider implements IProvider {
  id: string;
  config: ProviderConfig;
  state: ProviderState;
  metrics: ProviderMetrics;
  private cooldownBaseDelay: number = 5000; // 5 seconds
  private cooldownMaxDelay: number = 300000; // 5 minutes
  private cooldownJitter: number = 0.2; // 20% jitter

  constructor(config: ProviderConfig) {
    this.id = config.id;
    this.config = config;
    this.state = config.state;
    this.metrics = {
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      totalTokens: 0,
      totalLatency: 0,
      averageLatency: 0
    };
  }

  async callAI(prompt: string, options?: any): Promise<AIResponse> {
    throw new Error('callAI must be implemented by subclass');
  }

  async healthCheck(): Promise<boolean> {
    throw new Error('healthCheck must be implemented by subclass');
  }

  getCapabilities(): ProviderCapabilities {
    const caps: ProviderCapabilities = {
      text: false,
      vision: false,
      structuredOutput: false,
      imageGeneration: false,
      audio: false
    };
    
    this.config.capabilities.forEach(cap => {
      if (cap === 'text') caps.text = true;
      if (cap === 'vision') caps.vision = true;
      if (cap === 'structured_output') caps.structuredOutput = true;
      if (cap === 'image_generation') caps.imageGeneration = true;
      if (cap === 'audio') caps.audio = true;
    });
    
    return caps;
  }

  getState(): ProviderState {
    return this.state;
  }

  setState(state: ProviderState): void {
    this.state = state;
    this.config.state = state;
  }

  getMetrics(): ProviderMetrics {
    return { ...this.metrics };
  }

  getSafeConfig(): Omit<ProviderConfig, 'credential'> {
    const { credential, ...safeConfig } = this.config;
    return safeConfig;
  }

  recordSuccess(latency: number, tokens?: number): void {
    this.metrics.totalRequests++;
    this.metrics.successCount++;
    this.metrics.consecutiveSuccesses++;
    this.metrics.consecutiveFailures = 0;
    this.metrics.totalLatency += latency;
    this.metrics.averageLatency = this.metrics.totalLatency / this.metrics.totalRequests;
    
    if (tokens) {
      this.metrics.totalTokens += tokens;
    }

    // Reset to healthy after consecutive successes
    if (this.metrics.consecutiveSuccesses >= 3 && this.state !== ProviderState.HEALTHY) {
      this.setState(ProviderState.HEALTHY);
    }
  }

  recordFailure(error: any): void {
    this.metrics.totalRequests++;
    this.metrics.failureCount++;
    this.metrics.consecutiveFailures++;
    this.metrics.consecutiveSuccesses = 0;

    // Detect rate limit errors
    if (this.isRateLimitError(error)) {
      this.setState(ProviderState.RATE_LIMITED);
      this.setCooldown();
    } 
    // Detect authentication errors
    else if (this.isAuthError(error)) {
      this.setState(ProviderState.FAILED);
    }
    // Detect model not found
    else if (this.isModelNotFoundError(error)) {
      this.setState(ProviderState.FAILED);
    }
    // Degraded after failures
    else if (this.metrics.consecutiveFailures >= 5) {
      this.setState(ProviderState.DEGRADED);
    }
  }

  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      totalTokens: 0,
      totalLatency: 0,
      averageLatency: 0
    };
  }

  isAvailable(): boolean {
    return this.state === ProviderState.HEALTHY || this.state === ProviderState.DEGRADED;
  }

  isInCooldown(): boolean {
    if (!this.config.cooldownUntil) return false;
    return new Date() < this.config.cooldownUntil;
  }

  private isRateLimitError(error: any): boolean {
    const status = error?.status || error?.code;
    return status === 429 || 
           error?.message?.includes('rate_limit_exceeded') ||
           error?.message?.includes('quota_exceeded');
  }

  private isAuthError(error: any): boolean {
    const status = error?.status || error?.code;
    return status === 401 || status === 403 ||
           error?.message?.includes('permission_denied') ||
           error?.message?.includes('authentication');
  }

  private isModelNotFoundError(error: any): boolean {
    const status = error?.status || error?.code;
    return status === 404 ||
           error?.message?.includes('model_not_found');
  }

  private setCooldown(): void {
    const delay = Math.min(
      this.cooldownBaseDelay * Math.pow(2, this.metrics.consecutiveFailures),
      this.cooldownMaxDelay
    );
    
    const jitter = delay * this.cooldownJitter * (Math.random() * 2 - 1);
    const finalDelay = delay + jitter;
    
    this.config.cooldownUntil = new Date(Date.now() + finalDelay);
  }
}

export class GeminiProvider extends BaseProvider {
  private timeout: number = 30000; // 30 seconds default

  constructor(config: ProviderConfig, timeout?: number) {
    super(config);
    if (timeout) this.timeout = timeout;
  }

  async callAI(prompt: string, options?: any): Promise<AIResponse> {
    const startTime = Date.now();
    
    try {
      // Gemini API call implementation
      // This would make the actual API call to Google Gemini
      const response = await this.callGeminiAPI(prompt, options);
      
      const latency = Date.now() - startTime;
      const inputTokens = response.tokens?.input ?? 0;
      const outputTokens = response.tokens?.output ?? 0;
      this.recordSuccess(latency, inputTokens + outputTokens);
      
      return response;
    } catch (error) {
      this.recordFailure(error);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Simple health check with minimal request
      const response = await this.callGeminiAPI('Hello', { maxTokens: 10 });
      this.recordSuccess(Date.now() - Date.now());
      return true;
    } catch (error) {
      this.recordFailure(error);
      return false;
    }
  }

  private async callGeminiAPI(prompt: string, options?: any): Promise<AIResponse> {
    // Placeholder for actual Gemini API implementation
    // In production, this would use the @google/generative-ai SDK or fetch
    
    return {
      content: 'Generated response',
      tokens: { input: 10, output: 20 },
      model: this.config.modelId,
      provider: this.config.providerType
    };
  }
}

export class ProviderFactory {
  static createProvider(config: ProviderConfig): IProvider {
    switch (config.providerType.toLowerCase()) {
      case 'gemini':
        return new GeminiProvider(config);
      case 'openai':
        // Future: return new OpenAIProvider(config);
        throw new Error('OpenAI provider not yet implemented');
      case 'anthropic':
        // Future: return new AnthropicProvider(config);
        throw new Error('Anthropic provider not yet implemented');
      default:
        throw new Error(`Unknown provider type: ${config.providerType}`);
    }
  }
}

export class ProviderRouter {
  private providers: Map<string, IProvider> = new Map();
  private strategy: RotationStrategy = RotationStrategy.HEALTH_BASED;
  private roundRobinIndex: number = 0;
  private healthCheckInterval: number = 60000; // 60 seconds
  private healthCheckTimer?: NodeJS.Timeout;

  constructor(initialProviders: ProviderConfig[]) {
    initialProviders.forEach(config => {
      const provider = ProviderFactory.createProvider(config);
      this.providers.set(config.id, provider);
    });
  }

  setStrategy(strategy: RotationStrategy): void {
    this.strategy = strategy;
  }

  addProvider(config: ProviderConfig): void {
    const provider = ProviderFactory.createProvider(config);
    this.providers.set(config.id, provider);
  }

  removeProvider(providerId: string): void {
    this.providers.delete(providerId);
  }

  getProvider(providerId: string): IProvider | undefined {
    return this.providers.get(providerId);
  }

  getAllProviders(): IProvider[] {
    return Array.from(this.providers.values());
  }

  getHealthyProviders(): IProvider[] {
    return this.getAllProviders().filter(p => p.isAvailable() && !p.isInCooldown());
  }

  selectProvider(): IProvider | null {
    const healthyProviders = this.getHealthyProviders();
    
    if (healthyProviders.length === 0) {
      return null;
    }

    switch (this.strategy) {
      case RotationStrategy.HEALTH_BASED:
        return this.selectHealthBased(healthyProviders);
      case RotationStrategy.PRIORITY:
        return this.selectPriority(healthyProviders);
      case RotationStrategy.ROUND_ROBIN:
        return this.selectRoundRobin(healthyProviders);
      case RotationStrategy.LEAST_USED:
        return this.selectLeastUsed(healthyProviders);
      default:
        return healthyProviders[0];
    }
  }

  private selectHealthBased(providers: IProvider[]): IProvider {
    // Select provider with lowest average latency among healthy ones
    return providers.reduce((best, current) => {
      if (!best) return current;
      return current.getMetrics().averageLatency < best.getMetrics().averageLatency 
        ? current 
        : best;
    });
  }

  private selectPriority(providers: IProvider[]): IProvider {
    // Select provider with highest priority
    return providers.reduce((best, current) => {
      if (!best) return current;
      return current.config.priority > best.config.priority ? current : best;
    });
  }

  private selectRoundRobin(providers: IProvider[]): IProvider {
    const provider = providers[this.roundRobinIndex % providers.length];
    this.roundRobinIndex++;
    return provider;
  }

  private selectLeastUsed(providers: IProvider[]): IProvider {
    // Select provider with fewest total requests
    return providers.reduce((best, current) => {
      if (!best) return current;
      return current.getMetrics().totalRequests < best.getMetrics().totalRequests 
        ? current 
        : best;
    });
  }

  startHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    
    this.healthCheckTimer = setInterval(async () => {
      for (const provider of this.providers.values()) {
        if (provider.isInCooldown()) {
          // Check if cooldown has expired
          if (!provider.isInCooldown()) {
            await provider.healthCheck();
          }
        } else if (provider.getState() !== ProviderState.HEALTHY) {
          // Health check for non-healthy providers
          await provider.healthCheck();
        }
      }
    }, this.healthCheckInterval);
  }

  stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  setHealthCheckInterval(interval: number): void {
    this.healthCheckInterval = interval;
    this.startHealthChecks();
  }

  getAggregateMetrics(): ProviderMetrics {
    const aggregate: ProviderMetrics = {
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      totalTokens: 0,
      totalLatency: 0,
      averageLatency: 0
    };

    for (const provider of this.providers.values()) {
      const metrics = provider.getMetrics();
      aggregate.totalRequests += metrics.totalRequests;
      aggregate.successCount += metrics.successCount;
      aggregate.failureCount += metrics.failureCount;
      aggregate.totalTokens += metrics.totalTokens;
      aggregate.totalLatency += metrics.totalLatency;
    }

    if (aggregate.totalRequests > 0) {
      aggregate.averageLatency = aggregate.totalLatency / aggregate.totalRequests;
    }

    return aggregate;
  }
}

export class ProviderManager {
  private router: ProviderRouter;
  private retryConfig: {
    maxRetries: number;
    retryDelay: number;
  };

  constructor(initialProviders: ProviderConfig[], strategy: RotationStrategy = RotationStrategy.HEALTH_BASED) {
    this.router = new ProviderRouter(initialProviders);
    this.router.setStrategy(strategy);
    this.router.startHealthChecks();
    this.retryConfig = {
      maxRetries: 3,
      retryDelay: 1000
    };
  }

  async callAI(prompt: string, options?: any): Promise<AIResponse> {
    let lastError: any;
    let attempts = 0;

    while (attempts < this.retryConfig.maxRetries) {
      const provider = this.router.selectProvider();
      
      if (!provider) {
        throw new Error('No healthy providers available');
      }

      try {
        const response = await provider.callAI(prompt, options);
        return response;
      } catch (error) {
        lastError = error;
        attempts++;
        
        if (attempts < this.retryConfig.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, this.retryConfig.retryDelay));
        }
      }
    }

    throw lastError || new Error('AI call failed after retries');
  }

  addProvider(config: ProviderConfig): void {
    this.router.addProvider(config);
  }

  removeProvider(providerId: string): void {
    this.router.removeProvider(providerId);
  }

  enableProvider(providerId: string): void {
    const provider = this.router.getProvider(providerId);
    if (provider) {
      provider.setState(ProviderState.HEALTHY);
    }
  }

  disableProvider(providerId: string): void {
    const provider = this.router.getProvider(providerId);
    if (provider) {
      provider.setState(ProviderState.DISABLED);
    }
  }

  testProvider(providerId: string): Promise<boolean> {
    const provider = this.router.getProvider(providerId);
    if (!provider) {
      return Promise.reject(new Error('Provider not found'));
    }
    return provider.healthCheck();
  }

  setStrategy(strategy: RotationStrategy): void {
    this.router.setStrategy(strategy);
  }

  getProviderStatus(): Array<{
    id: string;
    name: string;
    state: ProviderState;
    metrics: ProviderMetrics;
    cooldownUntil?: Date;
  }> {
    return this.router.getAllProviders().map(provider => ({
      id: provider.id,
      name: provider.config.name,
      state: provider.getState(),
      metrics: provider.getMetrics(),
      cooldownUntil: provider.config.cooldownUntil
    }));
  }

  getAggregateMetrics(): ProviderMetrics {
    return this.router.getAggregateMetrics();
  }

  setRetryConfig(maxRetries: number, retryDelay: number): void {
    this.retryConfig = { maxRetries, retryDelay };
  }

  setHealthCheckInterval(interval: number): void {
    this.router.setHealthCheckInterval(interval);
  }

  shutdown(): void {
    this.router.stopHealthChecks();
  }
}
