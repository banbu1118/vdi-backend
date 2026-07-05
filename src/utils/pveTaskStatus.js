
// import { pveRequest } from "../config/pveClient.js";

// export const waitForTask = async (upid, timeout = 7200000, interval = 5000) => {
//   const start = Date.now();
//   const node = upid.split(':')[1];
//   const encodedUPID = encodeURIComponent(upid);

//   while (Date.now() - start < timeout) {
//     try {
//       const res = await pveRequest(
//         'get',
//         `/nodes/${node}/tasks/${encodedUPID}/status`
//       );

//       const task = res?.data?.data || res?.data;
//       console.log(`${new Date().toISOString()} 轮询 status:`, task?.status);

//       if (task?.status === 'stopped') {
//         return task;
//       }

//     } catch (err) {
//       console.warn(`${new Date().toISOString()} 轮询异常（忽略）:`, err.message);
//     }

//     await new Promise(r => setTimeout(r, interval));
//   }

//   throw new Error('任务轮询超时');
// }

import { pveRequest } from "../config/pveClient.js";

export const waitForTask = async (upidInput, timeout = 7200000, interval = 5000) => {
  const start = Date.now();

  /**
   * 1️⃣ 规范化 UPID（兼容 string / {data} / axios 风格）
   */
  let upid =
    typeof upidInput === 'string'
      ? upidInput
      : upidInput?.data?.data
        ?? upidInput?.data
        ?? null;

  if (typeof upid !== 'string') {
    throw new Error(`非法 UPID 类型: ${JSON.stringify(upidInput)}`);
  }

  /**
   * 2️⃣ 校验 UPID 格式
   * 标准格式: UPID:<node>:<pid>:...
   */
  const parts = upid.split(':');
  if (parts.length < 2 || parts[0] !== 'UPID') {
    throw new Error(`非法 UPID 格式: ${upid}`);
  }

  const node = parts[1];
  const encodedUPID = encodeURIComponent(upid);

  /**
   * 3️⃣ 轮询任务状态
   */
  while (Date.now() - start < timeout) {
    try {
      const res = await pveRequest(
        'get',
        `/nodes/${node}/tasks/${encodedUPID}/status`
      );

      const task = res?.data?.data ?? res?.data;
      console.log(`${new Date().toISOString()} 轮询 status:`, task?.status);

      if (task?.status === 'stopped') {
        return task;
      }

    } catch (err) {
      // PVE 偶发 500 / 596 是正常的，不能中断
      console.warn(`${new Date().toISOString()} 轮询异常（忽略）:`, err.message);
    }

    await new Promise(r => setTimeout(r, interval));
  }

  throw new Error('任务轮询超时');
};
