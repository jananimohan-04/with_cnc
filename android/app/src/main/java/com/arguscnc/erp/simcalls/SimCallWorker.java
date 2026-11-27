package com.arguscnc.erp.simcalls;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/** Background job: sends new calls of the company SIM (every 15 minutes, and shortly after each call). */
public class SimCallWorker extends Worker {
    public SimCallWorker(@NonNull Context context, @NonNull WorkerParameters params) { super(context, params); }

    @NonNull
    @Override
    public Result doWork() {
        try {
            SimCallSync.run(getApplicationContext());
            return Result.success();
        } catch (Exception e) {
            return getRunAttemptCount() < 5 ? Result.retry() : Result.failure();
        }
    }
}
