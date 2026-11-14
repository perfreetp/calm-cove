<template>
  <div>
    <h2 class="page-title">客户与订单 · 演出立项</h2>

    <el-tabs v-model="tab">
      <!-- 客户 -->
      <el-tab-pane label="客户管理" name="customer">
        <div class="toolbar">
          <el-button type="primary" :icon="Plus" @click="openCustomer()">新增客户</el-button>
        </div>
        <div class="panel">
          <el-table :data="store.customers" size="small">
            <el-table-column prop="name" label="客户名称" min-width="200" />
            <el-table-column prop="contact" label="联系人" width="120" />
            <el-table-column prop="phone" label="电话" width="150" />
            <el-table-column label="录入时间" width="180">
              <template #default="{ row }">{{ fmtDateTime(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="120">
              <template #default="{ row }">
                <el-button link type="primary" @click="openCustomer(row)">编辑</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <!-- 订单 -->
      <el-tab-pane label="订单管理" name="order">
        <div class="toolbar">
          <el-button type="primary" :icon="Plus" @click="openOrder()">新增订单</el-button>
        </div>
        <div class="panel">
          <el-table :data="store.orders" size="small">
            <el-table-column prop="orderNo" label="订单号" width="160" />
            <el-table-column prop="title" label="演出名称" min-width="200" />
            <el-table-column label="客户" width="160">
              <template #default="{ row }">{{ store.customerName(row.customerId) }}</template>
            </el-table-column>
            <el-table-column prop="droneCount" label="架数" width="80" />
            <el-table-column prop="showDate" label="演出日期" width="120" />
            <el-table-column prop="venue" label="场地" min-width="160" />
            <el-table-column label="预算(元)" width="120">
              <template #default="{ row }">¥{{ row.budget.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="orderTag(row.status)" size="small">{{ orderLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="170">
              <template #default="{ row }">
                <el-button link type="primary" @click="openOrder(row)">编辑</el-button>
                <el-button link type="success" :disabled="row.status !== 'confirmed' || hasProject(row.id)"
                  @click="openInit(row)">演出立项</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <!-- 立项记录 -->
      <el-tab-pane label="演出立项记录" name="project">
        <div class="panel">
          <el-table :data="store.projects" size="small">
            <el-table-column prop="projectNo" label="项目编号" width="110" />
            <el-table-column prop="title" label="演出名称" min-width="200" />
            <el-table-column label="责任策划" width="130">
              <template #default="{ row }">{{ store.userName(row.plannerId) }}</template>
            </el-table-column>
            <el-table-column prop="droneCount" label="架数" width="80" />
            <el-table-column prop="showDate" label="演出日期" width="120" />
            <el-table-column prop="deadline" label="交稿截止" width="120" />
            <el-table-column label="状态" width="110">
              <template #default="{ row }">
                <el-tag :type="STATUS_TYPE[row.status as DraftStatus]" size="small">
                  {{ STATUS_LABEL[row.status as DraftStatus] }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 客户对话框 -->
    <el-dialog v-model="customerVisible" :title="customerForm.id ? '编辑客户' : '新增客户'" width="440px">
      <el-form label-width="84px">
        <el-form-item label="客户名称"><el-input v-model="customerForm.name" /></el-form-item>
        <el-form-item label="联系人"><el-input v-model="customerForm.contact" /></el-form-item>
        <el-form-item label="电话"><el-input v-model="customerForm.phone" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="customerVisible = false">取消</el-button>
        <el-button type="primary" @click="saveCustomer">保存</el-button>
      </template>
    </el-dialog>

    <!-- 订单对话框 -->
    <el-dialog v-model="orderVisible" :title="orderForm.id ? '编辑订单' : '新增订单'" width="520px">
      <el-form label-width="96px">
        <el-form-item label="客户">
          <el-select v-model="orderForm.customerId" style="width: 100%">
            <el-option v-for="c in store.customers" :key="c.id" :value="c.id" :label="c.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="演出名称"><el-input v-model="orderForm.title" /></el-form-item>
        <el-form-item label="无人机架数"><el-input-number v-model="orderForm.droneCount" :min="1" :max="5000" /></el-form-item>
        <el-form-item label="演出日期"><el-date-picker v-model="orderForm.showDate" value-format="YYYY-MM-DD" style="width: 100%" /></el-form-item>
        <el-form-item label="场地"><el-input v-model="orderForm.venue" /></el-form-item>
        <el-form-item label="预算(元)"><el-input-number v-model="orderForm.budget" :min="0" :step="10000" /></el-form-item>
        <el-form-item label="订单状态">
          <el-select v-model="orderForm.status" style="width: 100%">
            <el-option value="negotiating" label="洽谈中" />
            <el-option value="confirmed" label="已确认" />
            <el-option value="closed" label="已结案" />
            <el-option value="cancelled" label="已取消" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="orderForm.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="orderVisible = false">取消</el-button>
        <el-button type="primary" @click="saveOrder">保存</el-button>
      </template>
    </el-dialog>

    <!-- 立项对话框 -->
    <el-dialog v-model="initVisible" title="演出立项" width="460px">
      <el-form label-width="100px">
        <el-form-item label="来源订单">
          <el-input :model-value="initOrder?.orderNo + ' · ' + initOrder?.title" disabled />
        </el-form-item>
        <el-form-item label="责任策划">
          <el-select v-model="initForm.plannerId" style="width: 100%">
            <el-option v-for="u in planners" :key="u.id" :value="u.id" :label="u.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="交稿截止">
          <el-date-picker v-model="initForm.deadline" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-alert type="info" :closable="false" show-icon
          title="立项后自动创建空域申报单（未申报状态），策划工位将收到该在制稿件。" />
      </el-form>
      <template #footer>
        <el-button @click="initVisible = false">取消</el-button>
        <el-button type="primary" @click="doInit">确认立项</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { useStore } from '@/store'
import { fmtDateTime, STATUS_LABEL, STATUS_TYPE } from '@/lib/labels'
import { uid } from '@/db/storage'
import type { Customer, DraftStatus, Order } from '@/types'

const store = useStore()
const tab = ref('order')
const planners = computed(() => store.users.filter((u) => u.role === 'planner'))

function orderLabel(s: string) {
  return { negotiating: '洽谈中', confirmed: '已确认', closed: '已结案', cancelled: '已取消' }[s] ?? s
}
function orderTag(s: string): 'info' | 'success' | 'warning' | 'danger' {
  return ({ negotiating: 'info', confirmed: 'success', closed: 'warning', cancelled: 'danger' } as const)[s as 'negotiating']
}
function hasProject(orderId: string) {
  return store.projects.some((p) => p.orderId === orderId)
}

// ---- 客户 ----
const customerVisible = ref(false)
const customerForm = reactive<Customer>({ id: '', name: '', contact: '', phone: '', createdAt: '' })
function openCustomer(c?: Customer) {
  Object.assign(customerForm, c ?? { id: '', name: '', contact: '', phone: '', createdAt: '' })
  customerVisible.value = true
}
function saveCustomer() {
  if (!customerForm.name) return ElMessage.warning('请填写客户名称')
  store.saveCustomer({ ...customerForm, id: customerForm.id || uid('c') })
  customerVisible.value = false
  ElMessage.success('客户已保存')
}

// ---- 订单 ----
const orderVisible = ref(false)
const orderForm = reactive<Order>({
  id: '', orderNo: '', customerId: '', title: '', droneCount: 50, showDate: '',
  venue: '', budget: 100000, status: 'confirmed', remark: '', createdAt: ''
})
function openOrder(o?: Order) {
  if (o) Object.assign(orderForm, o)
  else {
    Object.assign(orderForm, {
      id: '', orderNo: 'ORD-' + Date.now().toString().slice(-8), customerId: store.customers[0]?.id ?? '',
      title: '', droneCount: 50, showDate: '', venue: '', budget: 100000, status: 'confirmed', remark: '', createdAt: ''
    })
  }
  orderVisible.value = true
}
function saveOrder() {
  if (!orderForm.title || !orderForm.customerId) return ElMessage.warning('请填写客户与演出名称')
  store.saveOrder({ ...orderForm, id: orderForm.id || uid('o') })
  orderVisible.value = false
  ElMessage.success('订单已保存')
}

// ---- 立项 ----
const initVisible = ref(false)
const initOrder = ref<Order | null>(null)
const initForm = reactive({ plannerId: '', deadline: '' })
function openInit(o: Order) {
  initOrder.value = o
  initForm.plannerId = planners.value[0]?.id ?? ''
  initForm.deadline = o.showDate
  initVisible.value = true
}
function doInit() {
  if (!initOrder.value || !initForm.plannerId || !initForm.deadline) return ElMessage.warning('请完善立项信息')
  const p = store.createProject({ orderId: initOrder.value.id, plannerId: initForm.plannerId, deadline: initForm.deadline })
  initVisible.value = false
  ElMessage.success(`立项成功：${p.projectNo}，已进入策划工位`)
  tab.value = 'project'
}
</script>
