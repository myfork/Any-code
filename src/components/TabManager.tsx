import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, MoreHorizontal, MessageSquare, ArrowLeft, ExternalLink, Zap, Bot, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/hooks/useTranslation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { TabSessionWrapper } from './TabSessionWrapper';
import { useTabs } from '@/hooks/useTabs';
import { useSessionSync } from '@/hooks/useSessionSync'; // 🔧 NEW: 会话状态同步
import { selectProjectPath } from '@/lib/sessionHelpers';
import type { Session } from '@/lib/api';

interface TabManagerProps {
  onBack: () => void;
  className?: string;
  /**
   * 初始会话信息 - 从 SessionList 跳转时使用
   */
  initialSession?: Session;
  /**
   * 初始项目路径 - 创建新会话时使用
   */
  initialProjectPath?: string;
}

/**
 * TabManager - 多标签页会话管理器
 * 支持多个 Claude Code 会话同时运行，后台保持状态
 */
export const TabManager: React.FC<TabManagerProps> = ({
  onBack,
  className,
  initialSession,
  initialProjectPath,
}) => {
  const { t } = useTranslation();
  const {
    tabs,
    createNewTab,
    switchToTab,
    closeTab,
    updateTabStreamingStatus,
    reorderTabs, // 🔧 NEW: 拖拽排序
    detachTab,   // 🆕 多窗口支持
    createNewTabAsWindow, // 🆕 直接创建为独立窗口
  } = useTabs();

  // 🔧 NEW: 启用会话状态同步
  useSessionSync();

  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null); // 🔧 NEW: 拖拽悬停的位置
  const [tabToClose, setTabToClose] = useState<string | null>(null); // 🔧 NEW: 待关闭的标签页ID（需要确认）
  const tabsContainerRef = useRef<HTMLDivElement>(null);

  // ✨ Phase 3: Simple initialization flag (no complex state machine)
  const initializedRef = useRef(false);

  // 拖拽处理
  const handleTabDragStart = useCallback((tabId: string) => {
    setDraggedTab(tabId);
  }, []);

  const handleTabDragEnd = useCallback(() => {
    setDraggedTab(null);
    setDragOverIndex(null); // 🔧 NEW: 清除拖拽悬停状态
  }, []);

  // 🔧 NEW: 拖拽悬停处理 - 计算drop位置
  const handleTabDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault(); // 必须阻止默认行为以允许drop
    setDragOverIndex(index);
  }, []);

  // 🔧 NEW: 拖拽放置处理 - 执行重排序
  const handleTabDrop = useCallback((e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();

    if (!draggedTab) return;

    // 查找被拖拽标签页的索���
    const fromIndex = tabs.findIndex(t => t.id === draggedTab);
    if (fromIndex === -1 || fromIndex === targetIndex) {
      setDraggedTab(null);
      setDragOverIndex(null);
      return;
    }

    // 执行重排序
    reorderTabs(fromIndex, targetIndex);
    setDraggedTab(null);
    setDragOverIndex(null);
  }, [draggedTab, tabs, reorderTabs]);

  // 🔧 NEW: 处理标签页关闭（支持确认Dialog）
  const handleCloseTab = useCallback(async (tabId: string, force = false) => {
    const result = await closeTab(tabId, force);

    // 如果需要确认，显示Dialog
    if (result && typeof result === 'object' && 'needsConfirmation' in result && result.needsConfirmation) {
      setTabToClose(result.tabId || null);
    }
  }, [closeTab]);

  // 🔧 NEW: 确认关闭标签页
  const confirmCloseTab = useCallback(async () => {
    if (tabToClose) {
      await closeTab(tabToClose, true); // force close
      setTabToClose(null);
    }
  }, [tabToClose, closeTab]);

  // 🆕 NEW: 将标签页弹出为独立窗口
  const handleDetachTab = useCallback(async (tabId: string) => {
    try {
      await detachTab(tabId);
    } catch (error) {
      console.error('[TabManager] Failed to detach tab:', error);
    }
  }, [detachTab]);

  // 🆕 NEW: 创建新会话并直接打开为独立窗口
  const handleCreateNewTabAsWindow = useCallback(async () => {
    try {
      // 先让用户选择项目路径
      const selectedPath = await selectProjectPath();
      if (!selectedPath) {
        return;
      }

      // 使用选择的路径创建独立窗口
      await createNewTabAsWindow(undefined, selectedPath);
    } catch (error) {
      console.error('[TabManager] Failed to create new session window:', error);
    }
  }, [createNewTabAsWindow]);

  // ✨ Phase 3: Simplified initialization (single responsibility, no race conditions)
  useEffect(() => {
    // Only run once
    if (initializedRef.current) return;
    initializedRef.current = true;

    // 🔧 修复：新建操作应该覆盖已保存的标签页
    const isNewOperation = initialSession || initialProjectPath;

    // Priority 1: Initial session provided (highest priority)
    if (initialSession) {
      createNewTab(initialSession);
      return;
    }

    // Priority 2: Initial project path provided
    if (initialProjectPath) {
      createNewTab(undefined, initialProjectPath);
      return;
    }

    // Priority 3: Tabs restored from localStorage (only if no new operation)
    if (tabs.length > 0 && !isNewOperation) {
      return;
    }

    // Priority 4: No initial data - show empty state
  }, []); // Empty deps - only run once on mount

  return (
    <TooltipProvider>
      <div className={cn("h-full flex flex-col bg-background", className)}>
        {/* 🎨 极简标签页栏 */}
        <div className="flex-shrink-0 border-b border-border bg-background">
          <div className="flex items-center h-12 px-4 gap-2">
            {/* 返回按钮 */}
            <Button
              variant="default"
              size="sm"
              onClick={onBack}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-sm transition-all duration-200 hover:shadow-md border-0"
            >
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              <span>{t('tabs.back')}</span>
            </Button>

            {/* 分隔线 */}
            <div className="h-4 w-px bg-border" />

            {/* 标签页容器 */}
            <div
              ref={tabsContainerRef}
              className="flex-1 flex items-center gap-2 overflow-x-auto scrollbar-thin"
            >
              <AnimatePresence mode="popLayout">
                {tabs.map((tab, index) => (
                  <Tooltip key={tab.id}>
                    <TooltipTrigger asChild>
                      <motion.div
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className={cn(
                          "group relative flex items-center gap-2 px-3 py-1.5 rounded-lg min-w-[100px] max-w-[200px] flex-shrink-0 cursor-pointer",
                          "transition-colors",
                          tab.isActive
                            ? "bg-muted border border-border text-foreground"
                            : "bg-transparent border border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50",
                          draggedTab === tab.id && "ring-2 ring-primary",
                          dragOverIndex === index && draggedTab !== tab.id && "border-primary"
                        )}
                        onClick={() => switchToTab(tab.id)}
                        draggable
                        onDragStart={() => handleTabDragStart(tab.id)}
                        onDragEnd={handleTabDragEnd}
                        onDragOver={(e) => handleTabDragOver(e, index)}
                        onDrop={(e) => handleTabDrop(e, index)}
                      >
                        {/* 引擎图标 + 状态指示 */}
                        <div className="flex-shrink-0 flex items-center gap-1">
                          {/* 引擎图标 */}
                          {tab.session?.engine === 'codex' ? (
                            <Bot className={cn(
                              "h-3.5 w-3.5",
                              tab.isActive ? "text-green-500" : "text-muted-foreground"
                            )} />
                          ) : tab.session?.engine === 'gemini' ? (
                            <Sparkles className={cn(
                              "h-3.5 w-3.5",
                              tab.isActive ? "text-blue-500" : "text-muted-foreground"
                            )} />
                          ) : (
                            <Zap className={cn(
                              "h-3.5 w-3.5",
                              tab.isActive ? "text-amber-500" : "text-muted-foreground"
                            )} />
                          )}
                          {/* 状态指示器 */}
                          {tab.state === 'streaming' ? (
                            <Loader2 className="h-3 w-3 text-success animate-spin" />
                          ) : tab.hasUnsavedChanges ? (
                            <div className="h-1.5 w-1.5 bg-warning rounded-full" />
                          ) : null}
                        </div>

                        {/* 标签页标题 */}
                        <span className={cn(
                          "flex-1 truncate text-sm",
                          tab.isActive && "font-medium"
                        )}>
                          {tab.title}
                        </span>

                        {/* 弹出窗口按钮 - 仅在 hover 时显示 */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              className={cn(
                                "flex-shrink-0 h-5 w-5 rounded flex items-center justify-center",
                                "opacity-0 group-hover:opacity-100 transition-opacity",
                                "hover:bg-muted-foreground/20"
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDetachTab(tab.id);
                              }}
                            >
                              <ExternalLink className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            <span className="text-xs">{t('tabs.openInNewWindow')}</span>
                          </TooltipContent>
                        </Tooltip>

                        {/* 关闭按钮 - 仅在 hover 时显示 */}
                        <button
                          className={cn(
                            "flex-shrink-0 h-5 w-5 rounded flex items-center justify-center",
                            "opacity-0 group-hover:opacity-100 transition-opacity",
                            "hover:bg-muted-foreground/20"
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCloseTab(tab.id);
                          }}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </motion.div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-sm">
                      <div className="space-y-1.5 text-xs">
                        <div className="font-medium flex items-center gap-2">
                          {tab.title}
                          {tab.state === 'streaming' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/20 text-success">
                              运行中
                            </span>
                          )}
                        </div>
                        {/* 引擎类型 */}
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          {tab.session?.engine === 'codex' ? (
                            <>
                              <Bot className="h-3 w-3 text-green-500" />
                              <span>Codex</span>
                            </>
                          ) : tab.session?.engine === 'gemini' ? (
                            <>
                              <Sparkles className="h-3 w-3 text-blue-500" />
                              <span>Gemini</span>
                            </>
                          ) : (
                            <>
                              <Zap className="h-3 w-3 text-amber-500" />
                              <span>Claude</span>
                            </>
                          )}
                        </div>
                        {tab.session && (
                          <>
                            <div className="text-muted-foreground">
                              {t('tabs.sessionId')} {tab.session.id.slice(0, 8)}...
                            </div>
                            <div className="text-muted-foreground truncate">
                              {t('tabs.project')} {tab.projectPath || tab.session.project_path}
                            </div>
                            <div className="text-muted-foreground">
                              {t('tabs.createdAt')} {new Date(tab.session.created_at * 1000).toLocaleString('zh-CN')}
                            </div>
                          </>
                        )}
                        {!tab.session && tab.projectPath && (
                          <div className="text-muted-foreground truncate">
                            {t('tabs.project')} {tab.projectPath}
                          </div>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </AnimatePresence>

              {/* 新建标签页按钮 */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="flex-shrink-0 h-7 w-7 rounded flex items-center justify-center hover:bg-muted transition-colors"
                    onClick={() => createNewTab()}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t('tabs.newSession')}</TooltipContent>
              </Tooltip>
            </div>

            {/* 分隔线 */}
            <div className="h-4 w-px bg-border" />

            {/* 标签页菜单 */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-7 w-7 rounded flex items-center justify-center hover:bg-muted transition-colors">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => createNewTab()}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('tabs.newSession')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleCreateNewTabAsWindow}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  {t('tabs.newSessionWindow')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => tabs.forEach(tab => closeTab(tab.id, true))}
                  disabled={tabs.length === 0}
                >
                  {t('tabs.closeAllTabs')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => tabs.filter(tab => !tab.isActive).forEach(tab => closeTab(tab.id, true))}
                  disabled={tabs.length <= 1}
                >
                  {t('tabs.closeOtherTabs')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* 标签页内容区域 */}
        <div className="flex-1 relative overflow-hidden">
          {/* 🔧 STATE PRESERVATION: 渲染所有标签页但隐藏非活跃标签页 */}
          {/* 这样可以保持组件状态（包括输入框内容），避免切换标签页时状态丢失 */}
          {tabs.map((tab) => {
            return (
              <div
                key={tab.id}
                className={cn(
                  "absolute inset-0",
                  !tab.isActive && "hidden"
                )}
              >
                <TabSessionWrapper
                  tabId={tab.id}
                  session={tab.session}
                  initialProjectPath={tab.projectPath}
                  isActive={tab.isActive}
                  onStreamingChange={(isStreaming, sessionId) =>
                    updateTabStreamingStatus(tab.id, isStreaming, sessionId)
                  }
                />
              </div>
            );
          })}

          {/* 🎨 现代化空状态设计 */}
          {tabs.length === 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="flex items-center justify-center h-full"
            >
              <div className="text-center max-w-md px-8">
                {/* 图标 */}
                <motion.div
                  initial={{ y: -20 }}
                  animate={{ y: 0 }}
                  transition={{ 
                    type: "spring",
                    stiffness: 200,
                    damping: 20,
                    delay: 0.1
                  }}
                  className="mb-6"
                >
                  <div className="inline-flex p-6 rounded-2xl bg-muted/50 border border-border/50">
                    <MessageSquare className="h-16 w-16 text-muted-foreground/70" strokeWidth={1.5} />
                  </div>
                </motion.div>

                {/* 标题和描述 */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="mb-8"
                >
                  <h3 className="text-2xl font-bold mb-3 text-foreground">
                    {t('tabs.noActiveSessions')}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t('tabs.allTabsClosed')}
                  </p>
                </motion.div>

                {/* 操作按钮 */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="flex flex-col gap-3"
                >
                  <Button
                    size="lg"
                    onClick={() => createNewTab()}
                    className="w-full shadow-md hover:shadow-lg"
                  >
                    <Plus className="h-5 w-5 mr-2" />
                    {t('tabs.createNewSession')}
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={onBack}
                    className="w-full"
                  >
                    <ArrowLeft className="h-5 w-5 mr-2" />
                    {t('tabs.backToMain')}
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          )}
        </div>

        {/* 🔧 NEW: 自定义关闭确认Dialog */}
        <Dialog open={tabToClose !== null} onOpenChange={(open) => !open && setTabToClose(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('tabs.confirmCloseTab')}</DialogTitle>
              <DialogDescription>
                {t('tabs.unsavedChangesWarning')}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTabToClose(null)}>
                {t('buttons.cancel')}
              </Button>
              <Button variant="destructive" onClick={confirmCloseTab}>
                {t('tabs.confirmClose')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
};
