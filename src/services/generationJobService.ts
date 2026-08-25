/**
 * Generation Job Service
 * Manages long-running AI generation operations with status tracking
 */

import { supabase } from '../lib/supabase';

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface GenerationJob {
  id: string;
  workspace_id: string;
  user_id: string;
  task_type: string;
  input_data: Record<string, any>;
  status: JobStatus;
  progress: number;
  result?: Record<string, any>;
  error?: string;
  provider_id?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateJobParams {
  workspace_id: string;
  user_id: string;
  task_type: string;
  input_data: Record<string, any>;
  provider_id?: string;
}

export interface JobUpdateParams {
  status?: JobStatus;
  progress?: number;
  result?: Record<string, any>;
  error?: string;
  provider_id?: string;
  started_at?: string;
  completed_at?: string;
}

class GenerationJobService {
  /**
   * Create a new generation job
   */
  async createJob(params: CreateJobParams): Promise<GenerationJob> {
    const { data, error } = await supabase
      .from('ai_generation_jobs')
      .insert({
        workspace_id: params.workspace_id,
        user_id: params.user_id,
        task_type: params.task_type,
        input_data: params.input_data,
        provider_id: params.provider_id,
        status: 'queued',
        progress: 0
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create job: ${error.message}`);
    }

    return data;
  }

  /**
   * Get a job by ID
   */
  async getJob(jobId: string): Promise<GenerationJob | null> {
    const { data, error } = await supabase
      .from('ai_generation_jobs')
      .select()
      .eq('id', jobId)
      .single();

    if (error) {
      console.error('Failed to get job:', error);
      return null;
    }

    return data;
  }

  /**
   * Update a job
   */
  async updateJob(jobId: string, params: JobUpdateParams): Promise<GenerationJob | null> {
    const { data, error } = await supabase
      .from('ai_generation_jobs')
      .update({
        ...params,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId)
      .select()
      .single();

    if (error) {
      console.error('Failed to update job:', error);
      return null;
    }

    return data;
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const { error } = await supabase
      .from('ai_generation_jobs')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);

    if (error) {
      console.error('Failed to cancel job:', error);
      return false;
    }

    return true;
  }

  /**
   * Get all jobs for a workspace
   */
  async getWorkspaceJobs(workspaceId: string): Promise<GenerationJob[]> {
    const { data, error } = await supabase
      .from('ai_generation_jobs')
      .select()
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to get workspace jobs:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get jobs for a specific user
   */
  async getUserJobs(userId: string): Promise<GenerationJob[]> {
    const { data, error } = await supabase
      .from('ai_generation_jobs')
      .select()
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to get user jobs:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Poll a job until completion or timeout
   */
  async pollJob(
    jobId: string,
    onProgress?: (job: GenerationJob) => void,
    options?: {
      interval?: number;
      timeout?: number;
    }
  ): Promise<GenerationJob> {
    const interval = options?.interval || 1000; // 1 second default
    const timeout = options?.timeout || 300000; // 5 minutes default
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const poll = async () => {
        // Check timeout
        if (Date.now() - startTime > timeout) {
          reject(new Error('Job polling timeout'));
          return;
        }

        const job = await this.getJob(jobId);

        if (!job) {
          reject(new Error('Job not found'));
          return;
        }

        // Call progress callback
        if (onProgress) {
          onProgress(job);
        }

        // Check if job is complete
        if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
          resolve(job);
          return;
        }

        // Continue polling
        setTimeout(poll, interval);
      };

      poll();
    });
  }

  /**
   * Clean up old completed jobs
   */
  async cleanupOldJobs(daysOld: number = 7): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const { error } = await supabase
      .from('ai_generation_jobs')
      .delete()
      .lt('created_at', cutoffDate.toISOString())
      .in('status', ['completed', 'failed', 'cancelled']);

    if (error) {
      console.error('Failed to cleanup old jobs:', error);
      return 0;
    }

    return 1; // Success
  }

  /**
   * Get job statistics for a workspace
   */
  async getWorkspaceStats(workspaceId: string): Promise<{
    total: number;
    queued: number;
    processing: number;
    completed: number;
    failed: number;
    cancelled: number;
  }> {
    const jobs = await this.getWorkspaceJobs(workspaceId);

    return {
      total: jobs.length,
      queued: jobs.filter(j => j.status === 'queued').length,
      processing: jobs.filter(j => j.status === 'processing').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length,
      cancelled: jobs.filter(j => j.status === 'cancelled').length
    };
  }
}

// Singleton instance
const generationJobService = new GenerationJobService();

export default generationJobService;
