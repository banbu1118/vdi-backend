import {
  getTemplateCount,
  getVMCount,
  getVmGroupCount,
  getUserCount,
  getUserGroupCount,
  getTemplate,
  getVMList
} from "../services/taskCount.js";

import { createTask, updateTask, getTasks, getTask,cleanupSuccessTasks7Days } from "../services/taskPoller.js"


// ⭐ 合并统计接口
export const getAllCountsController = async (req, res) => {
  try {
    // 并行执行，提高性能
    const [
      templateCount,
      vmCount,
      vmGroupCount,
      userCount,
      userGroupCount
    ] = await Promise.all([
      getTemplateCount(),
      getVMCount(),
      getVmGroupCount(),
      getUserCount(),
      getUserGroupCount()
    ]);

    res.status(200).json({
      code: 0,
      message: "统计数据获取成功",
      data: {
        templateCount,
        vmCount,
        vmGroupCount,
        userCount,
        userGroupCount
      }
    });

  } catch (err) {
    res.status(500).json({
      code: 500,
      message: "统计数据获取失败",
      error: err.message
    });
  }
};

//获取模板列表
export const getTemplateController = async (req, res) => {
  try {
    const templates = await getTemplate();
    res.status(200).json({
      code: 0,
      message: "模板获取成功",
      data: templates
    });
  } catch (err) {
    res.status(500).json({
      code: 500,
      message: "模板获取失败",
      error: err.message
    });
  }
};

//获取虚拟机列表
export const getVMListController = async (req, res) => {
    try {
    const vms = await getVMList();
    res.status(200).json({
      code: 0,
      message: "虚拟机获取成功",
      data: vms
    });
  } catch (err) {
    res.status(500).json({
      code: 500,
      message: "虚拟机获取失败",
      error: err.message
    });
  }
}


//创建任务
export const createTaskController = async (req, res) => {
  try {
    const { type, payload } = req.body;
    const task = await createTask(type, payload);
    res.json({ msg: "task created", task });
  } catch (err) {
    res.status(500).json({
      code: 500,
      message: "任务创建失败",
      error: err.message
    });
  }
};

//更新任务
export const updateTaskController = async (req, res) => {
  try {
    const { id, status, message } = req.body;
    const task = await updateTask(id, status, message);
    res.json({ msg: "task updated", task });
  } catch (err) {
    res.status(500).json({
      code: 500,
      message: "任务更新失败",
      error: err.message
    });
  }
};

//获取任务列表
export const getTasksController = async (req, res) => {
  try {
    res.json(await getTasks());
  } catch (err) {
    res.status(500).json({
      code: 500,
      message: "任务列表获取失败",
      error: err.message
    });
  }
};

//获取单个任务
export const getTaskController = async (req, res) => {
  try {
    const { id } = req.params;
    res.json(await getTask(id));
  } catch (err) {
    res.status(500).json({
      code: 500,
      message: "任务获取失败",
      error: err.message
    });
  }
};

//七天内成功的任务清理
export const cleanupSuccessTasks7DaysController = async (req, res) => {
  try {
    const result = await cleanupSuccessTasks7Days();
    res.json(result);
  } catch (err) {
    res.status(500).json({
      code: 500,
      message: "任务清理失败",
      error: err.message
    });
  }
};