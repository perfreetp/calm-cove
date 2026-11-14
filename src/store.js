import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { uid, dayKey, fmtDate } from './constants'
import { computeStats } from './lib/geometry'

// 地块公共禁放区与邻接地块已有围栏(示例地形)
const SEED_TERRAIN = {
  width: 100,
  depth: 80,
  zones: [
    {
      id: 'z-river',
      kind: 'river',
      name: '那仁河支流',
      width: 4,
      path: [
        [-50, -18],
        [-30, -14],
        [-10, -20],
        [12, -12],
        [34, -16],
        [50, -10]
      ]
    },
    {
      id: 'z-road',
      kind: 'road',
      name: '牧道3号线',
      width: 6,
      path: [
        [20, 40],
        [24, 20],
        [18, 0],
        [26, -20],
        [22, -40]
      ]
    },
    {
      id: 'z-cattle',
      kind: 'cattle',
      name: '牲畜转场通道',
      width: 5,
      path: [
        [-40, 30],
        [-20, 26],
        [0, 32],
        [16, 28]
      ]
    }
  ],
  existingFences: [
    {
      id: 'f-north',
      name: '东邻地块围栏(阿木尔家)',
      path: [
        [44, -36],
        [44, -10],
        [44, 14],
        [44, 36]
      ]
    }
  ]
}

function makeArchiveNo(existing) {
  const day = dayKey()
  const seq = existing.filter((a) => a.archiveNo && a.archiveNo.includes(day)).length + 1
  return `WL-${day}-${String(seq).padStart(3, '0')}`
}

function seedObjects() {
  // 一条沿西侧的示例桩线,间距 5m
  const posts = []
  for (let i = 0; i < 8; i++) {
    const z = -28 + i * 5
    posts.push({ id: uid(), type: 'post', x: -34, z, rotY: 0 })
  }
  posts.push({ id: uid(), type: 'gate', x: -34, z: -2, rotY: 0 })
  posts.push({ id: uid(), type: 'water', x: -26, z: 10, rotY: 0 })
  return posts
}

function buildVersion(objects, spacingMode, note, verNo, status = 'draft') {
  const stats = computeStats(objects, spacingMode)
  return {
    id: uid(),
    version: verNo,
    note,
    status, // draft | submitted | rejected | approved
    spacingMode,
    objects: structuredClone(objects),
    stats,
    createdAt: fmtDate(),
    reviews: []
  }
}

function seedArchive() {
  const objects = seedObjects()
  const v1 = buildVersion(objects, 5, '初版布点方案', 1, 'approved')
  v1.reviews.push({
    id: uid(),
    action: 'approve',
    reviewer: '施工组长 巴特尔',
    comment: '线形与桩距符合规范,同意施工。',
    at: fmtDate()
  })
  return {
    id: uid(),
    archiveNo: `WL-${dayKey()}-001`,
    pastureNo: 'CC-0712',
    area: 326.5,
    fenceType: '网围栏',
    household: '孟克巴特尔',
    status: 'approved',
    terrain: structuredClone(SEED_TERRAIN),
    currentVersion: 1,
    versions: [v1],
    createdAt: fmtDate(),
    updatedAt: fmtDate()
  }
}

export const useStore = create(
  persist(
    (set, get) => ({
      role: '设计员',
      archives: [seedArchive()],

      setRole: (role) => set({ role }),

      createArchive: (data) => {
        const archives = get().archives
        const arc = {
          id: uid(),
          archiveNo: makeArchiveNo(archives),
          pastureNo: data.pastureNo,
          area: Number(data.area),
          fenceType: data.fenceType,
          household: data.household,
          status: 'draft',
          terrain: structuredClone(SEED_TERRAIN),
          currentVersion: 0,
          versions: [],
          createdAt: fmtDate(),
          updatedAt: fmtDate()
        }
        set({ archives: [arc, ...archives] })
        return arc.id
      },

      updateArchiveMeta: (id, data) =>
        set({
          archives: get().archives.map((a) =>
            a.id === id ? { ...a, ...data, updatedAt: fmtDate() } : a
          )
        }),

      deleteArchive: (id) =>
        set({ archives: get().archives.filter((a) => a.id !== id) }),

      getArchive: (id) => get().archives.find((a) => a.id === id),

      // 保存当前布点为新版本(草稿)
      saveDraft: (id, objects, spacingMode, note) => {
        const archives = get().archives
        const arc = archives.find((a) => a.id === id)
        if (!arc) return
        const nextNo = arc.versions.length ? Math.max(...arc.versions.map((v) => v.version)) + 1 : 1
        const ver = buildVersion(objects, spacingMode, note || `V${nextNo} 工作草稿`, nextNo, 'draft')
        set({
          archives: archives.map((a) =>
            a.id === id
              ? { ...a, versions: [...a.versions, ver], currentVersion: nextNo, updatedAt: fmtDate() }
              : a
          )
        })
        return ver.id
      },

      // 在已锁定(approved)版本基础上继续编辑时,显式新建版本
      newVersionFromCurrent: (id) => {
        const arc = get().archives.find((a) => a.id === id)
        const cur = arc.versions.find((v) => v.version === arc.currentVersion) || arc.versions[0]
        const nextNo = Math.max(...arc.versions.map((v) => v.version)) + 1
        const ver = buildVersion(cur.objects, cur.spacingMode, `基于 V${cur.version} 修改`, nextNo, 'draft')
        set({
          archives: get().archives.map((a) =>
            a.id === id
              ? { ...a, versions: [...a.versions, ver], currentVersion: nextNo, status: 'draft', updatedAt: fmtDate() }
              : a
          )
        })
        return structuredClone(ver.objects)
      },

      submitVersion: (id, versionId) => {
        const stamp = fmtDate()
        set({
          archives: get().archives.map((a) => {
            if (a.id !== id) return a
            return {
              ...a,
              status: 'submitted',
              updatedAt: stamp,
              versions: a.versions.map((v) =>
                v.id === versionId ? { ...v, status: 'submitted' } : v
              )
            }
          })
        })
      },

      reviewVersion: (id, versionId, action, comment, reviewer) => {
        const stamp = fmtDate()
        const review = { id: uid(), action, reviewer, comment, at: stamp }
        set({
          archives: get().archives.map((a) => {
            if (a.id !== id) return a
            const versions = a.versions.map((v) =>
              v.id === versionId
                ? {
                    ...v,
                    status: action === 'approve' ? 'approved' : 'rejected',
                    reviews: [...v.reviews, review]
                  }
                : v
            )
            const arcStatus = action === 'approve' ? 'approved' : 'rejected'
            return { ...a, versions, status: arcStatus, updatedAt: stamp }
          })
        })
      },

      archiveFile: (id) =>
        set({
          archives: get().archives.map((a) =>
            a.id === id ? { ...a, status: 'archived', updatedAt: fmtDate() } : a
          )
        }),

      unarchiveFile: (id) =>
        set({
          archives: get().archives.map((a) =>
            a.id === id ? { ...a, status: 'approved', updatedAt: fmtDate() } : a
          )
        }),

      recomputeStats: (id, versionId, spacingMode) => {
        // 间距档位切换后重算统计
        set({
          archives: get().archives.map((a) =>
            a.id !== id
              ? a
              : {
                  ...a,
                  versions: a.versions.map((v) =>
                    v.id === versionId
                      ? { ...v, spacingMode, stats: computeStats(v.objects, spacingMode) }
                      : v
                  )
                }
          )
        })
      }
    }),
    {
      name: 'pasture-fence-store-v1'
    }
  )
)

export const statusName = (key) => STATUS[key]?.name || key
