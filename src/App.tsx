/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { Plus, Search, MapPin, Phone, User, Calendar, Bell, Trash2, AlertCircle, CheckCircle2, Clock, Edit2, ArrowUpDown, ArrowUp, ArrowDown, Settings as SettingsIcon, Sun, Moon, LogIn, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'sonner';
import { useTheme } from 'next-themes';
import { useAuthState } from 'react-firebase-hooks/auth';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, orderBy, setDoc, getDoc } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { auth, db, signInWithGoogle, logout, requestNotificationPermission, getMessagingInstance } from './firebase';
import { onMessage } from 'firebase/messaging';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';

import { Customer, Settings } from './types';
import { calculatePortingDate, getPortingStatus, formatDate } from './lib/date-utils';

type SortConfig = {
  key: 'name' | 'addedAt' | 'portingDate';
  direction: 'asc' | 'desc';
} | null;

const DEFAULT_SETTINGS: Settings = {
  nearDays: 7,
  veryNearDays: 3,
  enableEmailNotifications: false,
  hasDismissedPromo: false,
};

export default function App() {
  const { theme, setTheme } = useTheme();
  const [user, loading] = useAuthState(auth);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<string | null>(null);
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    number: '',
    location: '',
  });
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission | 'unsupported'>('default');

  // Handle Push Notifications
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermissionStatus(Notification.permission);
    } else {
      setPermissionStatus('unsupported');
    }

    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/firebase-messaging-sw.js')
        .then((registration) => {
          console.log('Service Worker registered with scope:', registration.scope);
        })
        .catch((err) => {
          console.error('Service Worker registration failed:', err);
        });
    }

    if (user) {
      const setupNotifications = async () => {
        const msg = await getMessagingInstance();
        if (!msg) return;

        // We only auto-request if it's already granted
        if (Notification.permission === 'granted') {
          const token = await requestNotificationPermission();
          if (token) {
            await saveTokenToBackend(token, user.uid);
          }
        }

        const unsubscribe = onMessage(msg, (payload) => {
          toast.info(payload.notification?.title || 'Orma AI Alert', {
            description: payload.notification?.body,
            duration: 8000,
          });
        });

        return unsubscribe;
      };

      let unsubscribe: (() => void) | undefined;
      setupNotifications().then(unsub => {
        unsubscribe = unsub;
      });

      return () => {
        if (unsubscribe) unsubscribe();
      };
    }
  }, [user]);

  const saveTokenToBackend = async (token: string, userId: string) => {
    try {
      await fetch('/api/save-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, userId })
      });
    } catch (error) {
      console.error('Failed to save notification token:', error);
    }
  };

  const handleEnableNotifications = async () => {
    if (!user) {
      toast.error('Please login first');
      return;
    }
    const token = await requestNotificationPermission();
    if (token) {
      await saveTokenToBackend(token, user.uid);
      setPermissionStatus('granted');
      toast.success('Push notifications enabled!');
    } else {
      setPermissionStatus(Notification.permission);
      toast.error('Permission denied or failed to enable notifications');
    }
  };

  const handleTestNotification = async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/test-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Test notification sent!');
      } else {
        toast.error(data.error || 'Failed to send test notification');
      }
    } catch (error) {
      console.error('Test notification failed:', error);
      toast.error('Failed to connect to server');
    }
  };

  const handleTestEmail = async () => {
    if (!user || !user.email) return;
    try {
      const res = await fetch('/api/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid, email: user.email })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Test email sent! Please check your inbox.');
      } else {
        toast.error(data.error || 'Failed to send test email');
      }
    } catch (error) {
      console.error('Test email failed:', error);
      toast.error('Failed to connect to server');
    }
  };

  // Sync with Firestore
  useEffect(() => {
    if (!user) {
      setCustomers([]);
      return;
    }

    const q = query(
      collection(db, 'customers'),
      where('userId', '==', user.uid),
      orderBy('addedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as Customer[];
      setCustomers(docs);
    }, (error) => {
      console.error("Firestore Error:", error);
      toast.error("Failed to sync with cloud database");
    });

    return () => unsubscribe();
  }, [user]);

  // Load and sync settings
  useEffect(() => {
    // Load from localStorage first for immediate UI feedback
    const savedSettings = localStorage.getItem('porting_pro_settings');
    if (savedSettings) {
      try {
        setSettings(JSON.parse(savedSettings));
      } catch (e) {
        console.error('Failed to parse settings', e);
      }
    }

    if (!user) return;

    // Load from Firestore for logged in users
    const loadSettings = async () => {
      try {
        const settingsRef = doc(db, 'settings', user.uid);
        const settingsSnap = await getDoc(settingsRef);
        
        if (settingsSnap.exists()) {
          const cloudSettings = settingsSnap.data() as Settings;
          setSettings(cloudSettings);
          // Sync back to local storage
          localStorage.setItem('porting_pro_settings', JSON.stringify(cloudSettings));
        } else {
          // New user, initialize cloud settings with defaults plus email
          const initialSettings = { 
            ...DEFAULT_SETTINGS, 
            userEmail: user.email || undefined,
            updatedAt: new Date().toISOString()
          };
          await setDoc(settingsRef, initialSettings);
          setSettings(initialSettings as Settings);
        }
      } catch (error) {
        console.error("Error loading settings from cloud:", error);
      }
    };

    loadSettings();
  }, [user]);

  // Persist settings locally and to cloud
  const persistSettings = async (newSettings: Settings) => {
    localStorage.setItem('porting_pro_settings', JSON.stringify(newSettings));
    if (user) {
      try {
        const settingsRef = doc(db, 'settings', user.uid);
        await setDoc(settingsRef, {
          ...newSettings,
          userEmail: user.email || newSettings.userEmail,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (error) {
        console.error("Error persisting settings to cloud:", error);
      }
    }
  };

  // Check for notifications on load and periodic intervals
  useEffect(() => {
    const checkNotifications = () => {
      customers.forEach(customer => {
        const status = getPortingStatus(customer.portingDate, settings.nearDays, settings.veryNearDays);
        if (status.isVeryNear) {
          toast.warning(`Action Required: ${customer.name}`, {
            description: `Porting eligible in ${status.daysRemaining} days (${customer.number})`,
            duration: 5000,
          });
        } else if (status.isEligible) {
          toast.success(`Eligible Now: ${customer.name}`, {
            description: `Customer is ready to port! (${customer.number})`,
            duration: 5000,
          });
        }
      });
    };

    if (customers.length > 0) {
      checkNotifications();
    }
  }, [customers.length, settings]);

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('You must be logged in to add customers');
      return;
    }
    if (!newCustomer.name || !newCustomer.number) {
      toast.error('Please fill in all required fields');
      return;
    }

    const addedAt = new Date().toISOString();
    const portingDate = calculatePortingDate(addedAt);

    try {
      await addDoc(collection(db, 'customers'), {
        ...newCustomer,
        addedAt,
        portingDate,
        userId: user.uid,
        id: crypto.randomUUID(), // Keeping for local consistency if needed
      });

      setNewCustomer({ name: '', number: '', location: '' });
      setIsAddDialogOpen(false);
      toast.success('Customer added to cloud');
    } catch (error) {
      console.error("Add Error:", error);
      toast.error("Failed to save customer");
    }
  };

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer || !editingCustomer.name || !editingCustomer.number) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const customerRef = doc(db, 'customers', editingCustomer.id);
      await updateDoc(customerRef, {
        name: editingCustomer.name,
        number: editingCustomer.number,
        location: editingCustomer.location
      });

      setIsEditDialogOpen(false);
      setEditingCustomer(null);
      toast.success('Customer updated in cloud');
    } catch (error) {
      console.error("Update Error:", error);
      toast.error("Failed to update customer");
    }
  };

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await persistSettings(settings);
    setIsSettingsDialogOpen(false);
    toast.success('Settings updated and synced to cloud');
  };

  const confirmDelete = (id: string) => {
    setCustomerToDelete(id);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteCustomer = async () => {
    if (customerToDelete) {
      try {
        await deleteDoc(doc(db, 'customers', customerToDelete));
        setIsDeleteDialogOpen(false);
        setCustomerToDelete(null);
        toast.info('Customer removed from cloud');
      } catch (error) {
        console.error("Delete Error:", error);
        toast.error("Failed to delete customer");
      }
    }
  };

  const openEditDialog = (customer: Customer) => {
    setEditingCustomer({ ...customer });
    setIsEditDialogOpen(true);
  };

  const handleSort = (key: 'name' | 'addedAt' | 'portingDate') => {
    setSortConfig((prev) => {
      if (prev?.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        return null;
      }
      return { key, direction: 'asc' };
    });
  };

  const filteredCustomers = useMemo(() => {
    let result = customers.filter(c =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.number.includes(searchQuery) ||
      c.location.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (sortConfig) {
      result = [...result].sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [customers, searchQuery, sortConfig]);

  const stats = useMemo(() => {
    const eligible = customers.filter(c => getPortingStatus(c.portingDate, settings.nearDays, settings.veryNearDays).isEligible).length;
    const near = customers.filter(c => {
      const s = getPortingStatus(c.portingDate, settings.nearDays, settings.veryNearDays);
      return s.isNear && !s.isEligible;
    }).length;

    return { total: customers.length, eligible, near };
  }, [customers, settings]);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 font-sans transition-colors duration-300">
      <Toaster position="top-right" richColors />
      
      <div className="max-w-6xl mx-auto space-y-8">
        {!user && !loading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-8 text-center">
            <div className="bg-primary p-6 rounded-2xl text-primary-foreground shadow-2xl">
              <Bell className="w-16 h-16" />
            </div>
            <div className="space-y-2">
              <h2 className="text-5xl font-black tracking-tighter uppercase">Orma AI</h2>
              <p className="text-muted-foreground font-bold uppercase tracking-[0.3em] text-sm">Remember everyone</p>
            </div>
            <p className="max-w-md text-muted-foreground font-medium leading-relaxed">
              Securely track your telecom porting eligibility in the cloud. 
              Login to access your registry from any device.
            </p>
            <Button 
              size="lg" 
              onClick={async () => {
                try {
                  await signInWithGoogle();
                } catch (error: any) {
                  console.error("Login Error:", error);
                  toast.error(error.message || "Failed to sign in. If you are on a custom domain, ensure it is added to Firebase Authorized Domains.");
                }
              }}
              className="h-14 px-10 bg-foreground text-background hover:bg-foreground/90 font-black uppercase text-xs tracking-[0.2em] rounded-none"
            >
              <LogIn className="w-5 h-5 mr-3" />
              Get Started
            </Button>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-48">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-foreground"></div>
          </div>
        ) : (
          <>
            {/* Notification Setup Dialog */}
            <Dialog 
              open={!!user && permissionStatus === 'default' && !settings.hasDismissedPromo} 
              onOpenChange={(open) => {
                if (!open) {
                  const newSettings = { ...settings, hasDismissedPromo: true };
                  setSettings(newSettings);
                  persistSettings(newSettings);
                }
              }}
            >
              <DialogContent className="sm:max-w-[425px] rounded-none border-2 border-primary/20 shadow-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3 text-xl font-black uppercase tracking-tighter">
                    <div className="bg-primary p-2 rounded-lg text-primary-foreground">
                      <Bell className="w-5 h-5" />
                    </div>
                    Stay Updated
                  </DialogTitle>
                  <DialogDescription className="text-xs font-medium leading-relaxed pt-2">
                    Configure your eligibility alerts. Enabling push notifications ensures you never miss a porting date, even when the app is closed.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <Label className="font-bold text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2 block">Threshold Monitoring</Label>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="setup-near-days" className="text-[9px] uppercase font-black text-muted-foreground/70">Warning (Days)</Label>
                          <Input
                            id="setup-near-days"
                            type="number"
                            min="1"
                            max="30"
                            className="font-mono h-10 text-xs rounded-none border-foreground/10 focus-visible:ring-primary"
                            value={settings.nearDays}
                            onChange={e => setSettings({ ...settings, nearDays: parseInt(e.target.value) || 7 })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="setup-very-near-days" className="text-[9px] uppercase font-black text-muted-foreground/70">Urgent (Days)</Label>
                          <Input
                            id="setup-very-near-days"
                            type="number"
                            min="1"
                            max="14"
                            className="font-mono h-10 text-xs rounded-none border-foreground/10 focus-visible:ring-primary"
                            value={settings.veryNearDays}
                            onChange={e => setSettings({ ...settings, veryNearDays: parseInt(e.target.value) || 3 })}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 pt-2 border-t border-foreground/5">
                      <Label className="font-bold text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2 block">Communication Channels</Label>
                      <div className="flex items-center justify-between p-4 border border-foreground/10 rounded-none bg-muted/30">
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-black uppercase tracking-wider">Email Intel</p>
                          <p className="text-[9px] text-muted-foreground font-medium leading-tight max-w-[120px]">Get daily eligibility reports via email.</p>
                        </div>
                        <Switch 
                          checked={settings.enableEmailNotifications}
                          onCheckedChange={checked => setSettings({ ...settings, enableEmailNotifications: checked })}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <DialogFooter className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-foreground/5">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => {
                      const newSettings = { ...settings, hasDismissedPromo: true };
                      setSettings(newSettings);
                      persistSettings(newSettings);
                    }}
                    className="w-full sm:w-auto h-11 text-[10px] font-black uppercase tracking-[0.2em] rounded-none hover:bg-muted"
                  >
                    Maybe Later
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={handleEnableNotifications}
                    className="w-full sm:flex-1 h-11 px-6 bg-primary text-primary-foreground font-bold uppercase text-[10px] tracking-[0.2em] rounded-none shadow-[0_4px_14px_0_rgba(0,0,0,0.3)] hover:shadow-primary/20 transition-all active:scale-95"
                  >
                    Enable Push Notifications
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Header */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-black tracking-tight text-foreground flex items-center gap-3">
              <div className="bg-primary p-2 rounded-lg text-primary-foreground shadow-none">
                <Bell className="w-8 h-8" />
              </div>
              Orma AI
            </h1>
            <p className="text-muted-foreground font-medium tracking-wide uppercase text-xs">Remember everyone</p>
          </div>

          <div className="flex items-center gap-2">
            {!loading && (
              user ? (
                <div className="flex items-center gap-3 mr-4">
                  <div className="flex flex-col items-end hidden sm:flex">
                    <span className="text-[10px] font-black uppercase tracking-widest text-foreground">{user.displayName}</span>
                    <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-tighter">{user.email}</span>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={logout}
                    className="h-9 px-4 text-foreground font-black uppercase text-[10px] tracking-widest rounded-none border-foreground/10"
                  >
                    <LogOut className="w-3.5 h-3.5 mr-2" />
                    Logout
                  </Button>
                </div>
              ) : (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={signInWithGoogle}
                  className="h-9 px-4 text-foreground font-black uppercase text-[10px] tracking-widest rounded-none border-foreground/10 mr-4"
                >
                  <LogIn className="w-3.5 h-3.5 mr-2" />
                  Login with Google
                </Button>
              )
            )}
            <Button
              variant="outline"
              size="icon"
              className="rounded-full shadow-sm"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </Button>

            <Dialog open={isSettingsDialogOpen} onOpenChange={setIsSettingsDialogOpen}>
              <DialogTrigger render={<Button variant="outline" size="icon" className="rounded-full shadow-sm" />}>
                <SettingsIcon className="w-5 h-5" />
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Notification Settings</DialogTitle>
                  <DialogDescription>
                    Configure when you want to be notified about upcoming porting dates.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleUpdateSettings} className="space-y-6 py-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="near-days" className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Warning Threshold (Days)</Label>
                      <Input
                        id="near-days"
                        type="number"
                        min="1"
                        max="30"
                        className="font-mono"
                        value={settings.nearDays}
                        onChange={e => setSettings({ ...settings, nearDays: parseInt(e.target.value) || 7 })}
                      />
                      <p className="text-[10px] text-muted-foreground font-medium">Show amber warning when eligibility is within this many days.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="very-near-days" className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Urgent Threshold (Days)</Label>
                      <Input
                        id="very-near-days"
                        type="number"
                        min="1"
                        max="14"
                        className="font-mono"
                        value={settings.veryNearDays}
                        onChange={e => setSettings({ ...settings, veryNearDays: parseInt(e.target.value) || 3 })}
                      />
                      <p className="text-[10px] text-muted-foreground font-medium">Show red pulsing alert when eligibility is within this many days.</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Push Notifications</Label>
                      <div className="flex items-center justify-between p-3 border border-foreground/10 rounded-none bg-muted/30">
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-black uppercase tracking-wider">Cloud Alerts</p>
                          <p className="text-[9px] text-muted-foreground font-medium">Get notified even when the app is closed.</p>
                        </div>
                        <Button 
                          type="button"
                          variant="outline" 
                          size="sm" 
                          onClick={handleEnableNotifications}
                          className="h-8 px-3 text-[9px] font-black uppercase tracking-widest rounded-none border-foreground/20"
                        >
                          Enable
                        </Button>
                      </div>
                      <Button 
                        type="button"
                        variant="ghost" 
                        size="sm" 
                        onClick={handleTestNotification}
                        className="w-full h-8 text-[9px] font-black uppercase tracking-widest rounded-none border border-dashed border-foreground/10 hover:bg-muted"
                      >
                        Send Test Notification
                      </Button>
                    </div>
                    
                    <div className="space-y-4 pt-2 border-t border-foreground/5">
                      <Label className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Email Intelligence</Label>
                      <div className="flex items-center justify-between p-3 border border-foreground/10 rounded-none bg-muted/30">
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-black uppercase tracking-wider">Email Notifications</p>
                          <p className="text-[9px] text-muted-foreground font-medium">Receive eligibility reports via email.</p>
                        </div>
                        <Switch 
                          checked={settings.enableEmailNotifications}
                          onCheckedChange={checked => setSettings({ ...settings, enableEmailNotifications: checked })}
                        />
                      </div>
                      <Button 
                        type="button"
                        variant="ghost" 
                        size="sm" 
                        onClick={handleTestEmail}
                        disabled={!settings.enableEmailNotifications}
                        className="w-full h-8 text-[9px] font-black uppercase tracking-widest rounded-none border border-dashed border-foreground/10 hover:bg-muted disabled:opacity-30"
                      >
                        Send Test Email
                      </Button>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" className="w-full">Save Preferences</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger render={<Button size="lg" className="rounded-full shadow-lg hover:shadow-xl transition-all" />}>
                <Plus className="w-5 h-5 mr-2" />
                Add Customer
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Add New Customer</DialogTitle>
                  <DialogDescription>
                    Enter customer details to start tracking their porting eligibility.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddCustomer} className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Customer Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 w-4 h-4 text-muted-foreground opacity-50" />
                      <Input
                        id="name"
                        placeholder="John Doe"
                        className="pl-10 font-medium"
                        value={newCustomer.name}
                        onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="number" className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Mobile Number</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-3 w-4 h-4 text-muted-foreground opacity-50" />
                      <Input
                        id="number"
                        placeholder="9876543210"
                        className="pl-10 font-mono"
                        value={newCustomer.number}
                        onChange={e => setNewCustomer({ ...newCustomer, number: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location" className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Location</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 w-4 h-4 text-muted-foreground opacity-50" />
                      <Input
                        id="location"
                        placeholder="City, State"
                        className="pl-10 font-medium"
                        value={newCustomer.location}
                        onChange={e => setNewCustomer({ ...newCustomer, location: e.target.value })}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" className="w-full">Save Customer</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Edit Customer</DialogTitle>
                <DialogDescription>
                  Update customer details.
                </DialogDescription>
              </DialogHeader>
              {editingCustomer && (
                <form onSubmit={handleUpdateCustomer} className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-name" className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Customer Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 w-4 h-4 text-muted-foreground opacity-50" />
                      <Input
                        id="edit-name"
                        placeholder="John Doe"
                        className="pl-10 font-medium"
                        value={editingCustomer.name}
                        onChange={e => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-number" className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Mobile Number</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-3 w-4 h-4 text-muted-foreground opacity-50" />
                      <Input
                        id="edit-number"
                        placeholder="9876543210"
                        className="pl-10 font-mono"
                        value={editingCustomer.number}
                        onChange={e => setEditingCustomer({ ...editingCustomer, number: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-location" className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Location</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 w-4 h-4 text-muted-foreground opacity-50" />
                      <Input
                        id="edit-location"
                        placeholder="City, State"
                        className="pl-10 font-medium"
                        value={editingCustomer.location}
                        onChange={e => setEditingCustomer({ ...editingCustomer, location: e.target.value })}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" className="w-full">Update Details</Button>
                  </DialogFooter>
                </form>
              )}
            </DialogContent>
          </Dialog>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border shadow-none bg-card overflow-hidden relative rounded-none">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Total Customers</CardTitle>
              <User className="w-4 h-4 text-muted-foreground opacity-50" />
            </CardHeader>
            <CardContent>
              <div className="text-5xl font-black font-mono tracking-tighter">{stats.total}</div>
            </CardContent>
          </Card>
          <Card className="border shadow-none bg-card overflow-hidden relative rounded-none">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Eligible Now</CardTitle>
              <CheckCircle2 className="w-4 h-4 text-foreground opacity-50" />
            </CardHeader>
            <CardContent>
              <div className="text-5xl font-black font-mono tracking-tighter">{stats.eligible}</div>
            </CardContent>
          </Card>
          <Card className="border shadow-none bg-card overflow-hidden relative rounded-none">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Near Eligibility</CardTitle>
              <Clock className="w-4 h-4 text-foreground opacity-50" />
            </CardHeader>
            <CardContent>
              <div className="text-5xl font-black font-mono tracking-tighter">{stats.near}</div>
            </CardContent>
          </Card>
        </div>

        <Separator className="opacity-10" />

        {/* Main Content */}
        <Card className="border shadow-none bg-card overflow-hidden rounded-none">
          <CardHeader className="border-b bg-muted/10 pb-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <CardTitle className="text-xl font-black uppercase tracking-tight">Registry</CardTitle>
                <CardDescription className="font-medium text-[10px] uppercase tracking-widest">Porting Intelligence</CardDescription>
              </div>
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground opacity-50" />
                <Input
                  placeholder="SEARCH REGISTRY..."
                  className="pl-10 bg-background border-foreground/10 h-11 rounded-none uppercase text-xs tracking-widest font-bold"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[200px]">
                      <button 
                        onClick={() => handleSort('name')}
                        className="flex items-center gap-1.5 hover:text-foreground transition-colors font-bold uppercase tracking-wider text-[10px]"
                      >
                        Customer
                        {sortConfig?.key === 'name' ? (
                          sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />
                        ) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                      </button>
                    </TableHead>
                    <TableHead className="font-bold uppercase tracking-wider text-[10px]">Location</TableHead>
                    <TableHead>
                      <button 
                        onClick={() => handleSort('addedAt')}
                        className="flex items-center gap-1.5 hover:text-foreground transition-colors font-bold uppercase tracking-wider text-[10px]"
                      >
                        Added Date
                        {sortConfig?.key === 'addedAt' ? (
                          sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />
                        ) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button 
                        onClick={() => handleSort('portingDate')}
                        className="flex items-center gap-1.5 hover:text-foreground transition-colors font-bold uppercase tracking-wider text-[10px]"
                      >
                        Porting Date
                        {sortConfig?.key === 'portingDate' ? (
                          sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />
                        ) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                      </button>
                    </TableHead>
                    <TableHead className="font-bold uppercase tracking-wider text-[10px]">Status</TableHead>
                    <TableHead className="text-right font-bold uppercase tracking-wider text-[10px]">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence mode="popLayout">
                    {filteredCustomers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-32 text-center text-slate-400">
                          {searchQuery ? 'No customers found matching your search' : 'No customers added yet'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredCustomers.map((customer) => {
                        const status = getPortingStatus(customer.portingDate, settings.nearDays, settings.veryNearDays);
                        return (
                          <motion.tr
                            key={customer.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="group"
                          >
                            <TableCell className="font-medium">
                              <div className="flex flex-col">
                                <span className="text-base font-black uppercase tracking-tight">{customer.name}</span>
                                <DropdownMenu>
                                  <DropdownMenuTrigger className="text-[10px] text-muted-foreground font-mono tracking-widest hover:text-primary transition-colors text-left w-fit cursor-pointer outline-none">
                                    {customer.number}
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="start" className="rounded-none border-foreground/10 min-w-[160px]">
                                    <DropdownMenuItem 
                                      className="font-black uppercase text-[10px] tracking-widest cursor-pointer py-3"
                                      onClick={() => window.location.href = `tel:${customer.number}`}
                                    >
                                      <Phone className="w-3.5 h-3.5 mr-2 text-primary" />
                                      Call {customer.number}
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground font-bold text-[10px] uppercase tracking-widest">
                              <div className="flex items-center gap-1.5">
                                <MapPin className="w-3 h-3 opacity-30" />
                                {customer.location || 'N/A'}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground font-mono text-[10px]">
                              {formatDate(customer.addedAt)}
                            </TableCell>
                            <TableCell className="text-foreground font-black font-mono text-xs">
                              <div className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 opacity-30" />
                                {formatDate(customer.portingDate)}
                              </div>
                            </TableCell>
                            <TableCell>
                              {status.isEligible ? (
                                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200">
                                  Eligible Now
                                </Badge>
                              ) : status.isVeryNear ? (
                                <Badge variant="destructive" className="animate-pulse">
                                  {status.daysRemaining} Days Left
                                </Badge>
                              ) : status.isNear ? (
                                <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200">
                                  {status.daysRemaining} Days Left
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="font-normal">
                                  {status.daysRemaining} Days
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg"
                                  onClick={() => openEditDialog(customer)}
                                >
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                                  onClick={() => confirmDelete(customer.id)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </motion.tr>
                        );
                      })
                    )}
                  </AnimatePresence>
                </TableBody>
              </Table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-slate-100">
              <AnimatePresence mode="popLayout">
                {filteredCustomers.length === 0 ? (
                  <div className="p-8 text-center text-slate-400">
                    {searchQuery ? 'No customers found matching your search' : 'No customers added yet'}
                  </div>
                ) : (
                  filteredCustomers.map((customer) => {
                    const status = getPortingStatus(customer.portingDate, settings.nearDays, settings.veryNearDays);
                    return (
                      <motion.div
                        key={customer.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="p-4 space-y-3"
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <h3 className="font-bold text-foreground">{customer.name}</h3>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Phone className="w-3 h-3 opacity-70" />
                              <DropdownMenu>
                                <DropdownMenuTrigger className="font-mono tracking-tight hover:text-primary transition-colors cursor-pointer outline-none">
                                  {customer.number}
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="rounded-none border-foreground/10 min-w-[160px]">
                                  <DropdownMenuItem 
                                    className="font-black uppercase text-[10px] tracking-widest cursor-pointer py-3"
                                    onClick={() => window.location.href = `tel:${customer.number}`}
                                  >
                                    <Phone className="w-3.5 h-3.5 mr-2 text-primary" />
                                    Call {customer.number}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                          {status.isEligible ? (
                            <Badge className="bg-foreground text-background hover:bg-foreground border-none font-black uppercase text-[9px] tracking-widest rounded-none">
                              Eligible
                            </Badge>
                          ) : status.isVeryNear ? (
                            <Badge variant="destructive" className="animate-pulse font-black uppercase text-[9px] tracking-widest rounded-none">
                              {status.daysRemaining}d Left
                            </Badge>
                          ) : status.isNear ? (
                            <Badge className="bg-foreground/10 text-foreground hover:bg-foreground/20 border-none font-black uppercase text-[9px] tracking-widest rounded-none">
                              {status.daysRemaining}d Left
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="font-black uppercase text-[9px] tracking-widest rounded-none border-foreground/10">
                              {status.daysRemaining}d
                            </Badge>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div className="space-y-1">
                            <span className="text-muted-foreground uppercase tracking-widest font-bold text-[9px]">Location</span>
                            <div className="flex items-center gap-1.5 text-foreground font-medium">
                              <MapPin className="w-3 h-3 opacity-50" />
                              {customer.location || 'N/A'}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-muted-foreground uppercase tracking-widest font-bold text-[9px]">Porting Date</span>
                            <div className="flex items-center gap-1.5 text-foreground font-bold font-mono">
                              <Calendar className="w-3 h-3 text-primary opacity-70" />
                              {formatDate(customer.portingDate)}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2">
                          <span className="text-[10px] text-muted-foreground font-mono">Added: {formatDate(customer.addedAt)}</span>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-9 px-4 text-foreground font-black uppercase text-[10px] tracking-widest rounded-none border-foreground/10"
                              onClick={() => openEditDialog(customer)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-9 px-4 text-destructive hover:bg-destructive/5 font-black uppercase text-[10px] tracking-widest rounded-none border-destructive/20"
                              onClick={() => confirmDelete(customer.id)}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </AnimatePresence>
            </div>
          </CardContent>
        </Card>

        {/* Footer Info */}
        <div className="flex items-center justify-center gap-2 text-muted-foreground text-[10px] py-12 font-bold uppercase tracking-[0.2em] opacity-40">
          <AlertCircle className="w-3 h-3" />
          <span>90-Day Porting Intelligence Protocol</span>
        </div>
      </>
    )}

    {/* Delete Confirmation Dialog */}
    <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10 text-destructive mb-4 mx-auto sm:mx-0">
            <Trash2 className="w-6 h-6" />
          </div>
          <AlertDialogTitle className="text-xl font-black uppercase tracking-tight">Delete Customer?</AlertDialogTitle>
          <AlertDialogDescription className="font-medium text-muted-foreground">
            This action cannot be undone. This will permanently remove <span className="font-bold text-foreground">
              {customers.find(c => c.id === customerToDelete)?.name}
            </span> from your cloud registry.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-6">
          <AlertDialogCancel variant="outline" size="default" className="rounded-none font-bold uppercase tracking-widest text-[10px] border-foreground/10">
            cancel
          </AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleDeleteCustomer} 
            className="rounded-none font-black uppercase tracking-widest text-[10px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete Permanently
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
      </div>
    </div>
  );
}
