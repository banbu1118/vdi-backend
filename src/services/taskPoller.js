import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TASK_FILE = path.join(__dirname, "tasks.json");

// 写入锁
let taskWriteLock = Promise.resolve();
const enqueueWrite = (fn) => {
  taskWriteLock = taskWriteLock.then(fn, fn);
  return taskWriteLock;
};

// 初始化
const initCache = async () => {
  try {
    await fs.access(TASK_FILE);
  } catch {
    await fs.writeFile(TASK_FILE, JSON.stringify([]));
  }
};

const readTasks = async () => {
  try {
    const content = await fs.readFile(TASK_FILE, "utf-8");
    if (!content.trim()) return [];  // 空文件直接返回空数组
    return JSON.parse(content);
  } catch (err) {
    console.warn("tasks.json 读取失败，重置为空列表:", err.message);
    await fs.writeFile(TASK_FILE, JSON.stringify([])); // 修复文件
    return [];
  }
};


const writeTasks = async (data) => {
  return enqueueWrite(async () => {
    await fs.writeFile(TASK_FILE, JSON.stringify(data, null, 2));
  });
};

await initCache();

// ---------------- API ----------------

export const createTask = async (type, payload = {}) => {
  const tasks = await readTasks();

  const task = {
    id: Date.now().toString(),
    type,
    status: "running",
    payload,
    message: "",
    createTime: new Date().toISOString(),
    updateTime: new Date().toISOString(),
  };

  tasks.push(task);
  await writeTasks(tasks);

  return task;
};

export const updateTask = async (id, status, message = "") => {
  const tasks = await readTasks();
  const task = tasks.find((t) => t.id === id);

  if (!task) throw new Error("Task not found");

  task.status = status;
  task.message = message;
  task.updateTime = new Date().toISOString();

  await writeTasks(tasks);
  return task;
};

export const getTasks = async () => await readTasks();

export const getTask = async (id) => {
  const tasks = await readTasks();
  return tasks.find((t) => t.id === id) ?? null;
};


// 清理 7 天前已成功的任务
export const cleanupSuccessTasks7Days = async () => {
  const tasks = await readTasks();

  const now = Date.now();
  const sevenDays = 10 * 1000; // 10 秒


  const filtered = tasks.filter((t) => {
    if (t.status !== "success") return true;

    const updateTime = new Date(t.updateTime).getTime();
    return now - updateTime < sevenDays; // 保留未超过7天的 success 任务
  });

  await writeTasks(filtered);

  return {
    before: tasks.length,
    after: filtered.length,
    removed: tasks.length - filtered.length,
  };
};
