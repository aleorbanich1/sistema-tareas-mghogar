import localforage from 'localforage';
import { v4 as uuidv4 } from 'uuid';

localforage.config({
  name: 'MG_Hogar_PWA',
  storeName: 'offline_store', // Should be alphanumeric, with underscores.
  description: 'offline storage for tasks and messages'
});

export const DB = {
  // --- Tasks ---
  async getTasks() {
    return (await localforage.getItem('tasks')) || [];
  },
  async saveTasks(tasks) {
    await localforage.setItem('tasks', tasks);
  },
  async upsertTask(task) {
    const tasks = await this.getTasks();
    const idx = tasks.findIndex(t => (t.uuid && t.uuid === task.uuid) || t.id === task.id);
    if (idx >= 0) {
      tasks[idx] = { ...tasks[idx], ...task };
    } else {
      tasks.push(task);
    }
    await this.saveTasks(tasks);
  },
  async removeTask(idOrUuid) {
    let tasks = await this.getTasks();
    tasks = tasks.filter(t => t.id !== idOrUuid && t.uuid !== idOrUuid);
    await this.saveTasks(tasks);
  },

  // --- Messages ---
  async getMessages() {
    return (await localforage.getItem('messages')) || [];
  },
  async saveMessages(messages) {
    await localforage.setItem('messages', messages);
  },
  async upsertMessage(msg) {
    const messages = await this.getMessages();
    const idx = messages.findIndex(m => (m.uuid && m.uuid === msg.uuid) || m.id === msg.id);
    if (idx >= 0) {
      messages[idx] = { ...messages[idx], ...msg };
    } else {
      messages.push(msg);
    }
    await this.saveMessages(messages);
  },

  // --- Sync Queue ---
  async getSyncQueue() {
    return (await localforage.getItem('syncQueue')) || [];
  },
  async enqueueSync(operation) {
    // operation: { type: 'CREATE_TASK' | 'UPDATE_TASK' | 'SEND_MESSAGE', data: any, uuid: string }
    const queue = await this.getSyncQueue();
    // Use uuid to avoid duplicate enqueueing of same operation
    if (!queue.find(op => op.uuid === operation.uuid)) {
      queue.push(operation);
      await localforage.setItem('syncQueue', queue);
    }
  },
  async dequeueSync(uuid) {
    let queue = await this.getSyncQueue();
    queue = queue.filter(op => op.uuid !== uuid);
    await localforage.setItem('syncQueue', queue);
  },
  async clearSyncQueue() {
    await localforage.setItem('syncQueue', []);
  },

  // Helper
  generateUUID: () => uuidv4(),
};
