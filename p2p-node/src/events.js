// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { formatErrorSummary } from "./config.js";

export function isRecoverableOrbitDbSyncError(error) {
  const summary = formatErrorSummary(error);
  return (
    summary.includes("No content routers available") ||
    summary.includes("Unable to fetch raw block for CID") ||
    summary.includes("Want was aborted")
  );
}

export function registerOrbitDbEventHandlers(db, logger = console) {
  const logOrbitDbSyncWarning = (error) => {
    logger.warn("OrbitDB sync warning:", formatErrorSummary(error));
  };
  const logRecordCount = () => {
    void db.all()
      .then((records) => {
        logger.log("records:", records.length);
      })
      .catch(logOrbitDbSyncWarning);
  };

  db.events.on("error", logOrbitDbSyncWarning);
  db.events.on("update", logRecordCount);

  return () => {
    db.events.off?.("error", logOrbitDbSyncWarning);
    db.events.off?.("update", logRecordCount);
  };
}

export function registerRecoverableProcessErrorHandlers(processLike = process, logger = console) {
  const warnIfRecoverable = (error) => {
    if (!isRecoverableOrbitDbSyncError(error)) {
      return false;
    }

    logger.warn("OrbitDB background sync warning:", formatErrorSummary(error));
    return true;
  };

  const exitWithUnhandledError = (label, error) => {
    logger.error(label, error);
    processLike.exitCode = 1;
    processLike.exit?.(1);
  };

  const onUnhandledRejection = (reason) => {
    if (!warnIfRecoverable(reason)) {
      exitWithUnhandledError("Unhandled promise rejection:", reason);
    }
  };

  const onUncaughtException = (error) => {
    if (!warnIfRecoverable(error)) {
      exitWithUnhandledError("Uncaught exception:", error);
    }
  };

  processLike.on("unhandledRejection", onUnhandledRejection);
  processLike.on("uncaughtException", onUncaughtException);

  return () => {
    processLike.off?.("unhandledRejection", onUnhandledRejection);
    processLike.off?.("uncaughtException", onUncaughtException);
  };
}
