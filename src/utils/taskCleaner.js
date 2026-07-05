// ====================== 🕒 每周日凌晨 00:00 自动清理 success 任务 ======================
import cron from "node-cron";
import {cleanupSuccessTasks7Days} from "../services/taskPoller.js"// 每周日凌晨 00:00 执行

export const initTaskCleaner = () => {
  console.log("[TaskCleaner] 自动清理任务系统已启动...");

  // 每周日凌晨 00:00 执行
  cron.schedule(
    "0 0 * * 0",
    () => {
      console.log("[CRON] 开始执行七天任务清理...");
      cleanupSuccessTasks7Days()
        .then((result) => {
          console.log(`[CRON] 清理完成: 删除 ${result.removed} 个任务`);
        })
        .catch((err) => {
          console.error("[CRON] 清理任务失败:", err);
        });
    },
    {
      timezone: "Asia/Shanghai",
    }
  );
};