import objectsUtils from "@al/utils/objects";
import stringsUtils from "@al/utils/strings";

type JSONLog = Record<string, string>;
type JSONLogs = JSONLog[];

interface GroupedMsg {
  msg: string;
  logs: JSONLogs;
  hasErrors: boolean;
}

interface Summary {
  msgs: GroupedMsg[];
  httpCodes: GroupedMsg[];
  jobs: GroupedMsg[];
  plugins: GroupedMsg[];
}

interface SummaryMap {
  msgs: Map<string, GroupedMsg>;
  httpCodes: Map<string, GroupedMsg>;
  jobs: Map<string, GroupedMsg>;
  plugins: Map<string, GroupedMsg>;
}

type LogsGenerator = Generator<JSONLog | null, void, unknown>;

class LogData {
  fileInfo = {
    name: "",
    size: 0,
  };

  logs: JSONLogs = [];
  keys: string[] = [];

  summary: Summary = {
    httpCodes: [],
    jobs: [],
    msgs: [],
    plugins: [],
  };

  static readonly sortByLogsFn = (a: GroupedMsg, b: GroupedMsg) =>
    b.logs.length - a.logs.length;
  static readonly sortByMsgFn = (a: GroupedMsg, b: GroupedMsg) =>
    a.msg >= b.msg ? 1 : -1;
  static readonly errorFilterFn = (msgs: GroupedMsg[]) =>
    msgs.filter((m) => m.hasErrors);

  private static readonly msgCutOffLen = 80;
  static readonly logKeys = {
    id: "id",
    fullData: "fullData",
    timestamp: "timestamp",
    msg: "msg",
    level: "level",
    error: "error",
    Error: "Error",
    plugin_id: "plugin_id",
    worker: "worker",
    workername: "workername",
    scheduler_name: "scheduler_name",
    status_code: "status_code",
    status: "status",
  };
  private static readonly levels = {
    error: "error",
  };

  init(logsGeneratorFn: () => LogsGenerator) {
    const summaryMap: SummaryMap = {
      httpCodes: new Map<string, GroupedMsg>(),
      jobs: new Map<string, GroupedMsg>(),
      msgs: new Map<string, GroupedMsg>(),
      plugins: new Map<string, GroupedMsg>(),
    };

    const keysSet = new Set<string>();
    let count = 0;
    for (const log of logsGeneratorFn()) {
      if (log == null) {
        continue;
      }

      log[LogData.logKeys.fullData] = JSON.stringify(log);
      this.logs.push(log);
      log[LogData.logKeys.id] = count++ as any;

      LogData.initSummaryMap(log, summaryMap);
      LogData.initKeysSet(log, keysSet);
    }

    this.keys = [...keysSet].sort();
    this.initSummary(summaryMap);
  }

  static isErrorLog(log: JSONLog): boolean {
    return (
      log[LogData.logKeys.level] === LogData.levels.error ||
      !!log[LogData.logKeys.error] ||
      !!log[LogData.logKeys.Error]
    );
  }

  initFileInfo(file: File) {
    this.fileInfo = {
      name: file.name,
      size: file.size,
    };
  }

  private static initKeysSet(log: JSONLog, keysSet: Set<string>) {
    objectsUtils.getNestedKeys(log).forEach((k) => keysSet.add(k));
  }

  private initSummary(summaryMap: SummaryMap) {
    this.summary.msgs = [...summaryMap.msgs.values()].sort(
      LogData.sortByLogsFn
    );
    this.summary.httpCodes = [...summaryMap.httpCodes.values()].sort(
      LogData.sortByMsgFn
    );
    this.summary.jobs = [...summaryMap.jobs.values()].sort(
      LogData.sortByLogsFn
    );
    this.summary.plugins = [...summaryMap.plugins.values()].sort(
      LogData.sortByLogsFn
    );
  }

  private static initSummaryMap(log: JSONLog, summaryMap: SummaryMap) {
    LogData.populateSummaryMap(log, summaryMap.msgs, LogData.msgKeySelector);
    LogData.populateSummaryMap(log, summaryMap.jobs, LogData.jobKeySelector);
    LogData.populateSummaryMap(
      log,
      summaryMap.httpCodes,
      LogData.httpCodeKeySelector
    );
    LogData.populateSummaryMap(
      log,
      summaryMap.plugins,
      LogData.pluginKeySelector
    );
  }

  private static populateSummaryMap(
    log: JSONLog,
    grpLogsMap: Map<string, GroupedMsg>,
    keySelectorFn: (log: JSONLog) => string | undefined
  ) {
    const key = keySelectorFn(log);
    if (!key) return;

    if (!grpLogsMap.has(key)) {
      grpLogsMap.set(key, {
        msg: key,
        hasErrors: false,
        logs: [],
      });
    }

    const grpLog = grpLogsMap.get(key)!;
    grpLog.logs.push(log);
    if (!grpLog.hasErrors && LogData.isErrorLog(log)) {
      grpLog.hasErrors = true;
    }
  }

  private static msgKeySelector(log: JSONLog): string {
    return LogData.getCutOffMsg(log);
  }

  private static httpCodeKeySelector(log: JSONLog): string | undefined {
    return log[LogData.logKeys.status_code] || log[LogData.logKeys.status];
  }

  private static jobKeySelector(log: JSONLog): string | undefined {
    return (
      log[LogData.logKeys.scheduler_name] ||
      log[LogData.logKeys.worker] ||
      log[LogData.logKeys.workername]
    );
  }

  private static pluginKeySelector(log: JSONLog): string | undefined {
    return log[LogData.logKeys.plugin_id];
  }

  private static getCutOffMsg(log: JSONLog) {
    return stringsUtils
      .cleanText(log[LogData.logKeys.msg])
      .substring(0, LogData.msgCutOffLen)
      .trim();
  }
}

export default LogData;
export type { JSONLog, JSONLogs, GroupedMsg, LogsGenerator, Summary };
