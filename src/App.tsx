/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { Plus, Search, MapPin, Phone, User as UserIcon, Calendar, Bell, Trash2, AlertCircle, AlertTriangle, CheckCircle2, Clock, Edit2, ArrowUpDown, ArrowUp, ArrowDown, Settings as SettingsIcon, Sun, Moon, LogOut, Loader2, ShieldAlert, ShieldCheck, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'sonner';
import { useTheme } from 'next-themes';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  DropdownMenuSeparator,
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

import { Customer, Settings, User } from './types';
import { calculatePortingDate, getPortingStatus, formatDate } from './lib/date-utils';

declare global {
  interface Window {
    google: any;
  }
}

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
  const [user, setUser] = useState<User | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
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
    addedAtMode: 'today' as 'today' | 'custom',
    customAddedAt: '',
    portingDateMode: 'auto' as 'auto' | 'manual' | 'days',
    manualPortingDate: '',
    portingDaysOffset: '90',
  });
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission | 'unsupported'>('default');

  // Phone Login States
  const [loginMethod, setLoginMethod] = useState<'google' | 'phone'>('google');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Auth Initialization
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          await fetchData();
        }
      } catch (e) {
        console.error('Auth check failed', e);
      } finally {
        setIsLoadingAuth(false);
      }
    }
    checkAuth();
  }, []);

  // Google One Tap / Button Setup
  useEffect(() => {
    if (!isLoadingAuth && !user) {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!clientId) {
        console.warn('VITE_GOOGLE_CLIENT_ID is not set. Google Login will be unavailable.');
        return;
      }

      const handleCallback = async (response: any) => {
        try {
          const res = await fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: response.credential }),
          });
          const data = await res.json();
          if (data.user) {
            setUser(data.user);
            await fetchData();
            toast.success(`Welcome, ${data.user.name}`);
          }
        } catch (e) {
          toast.error('Login failed');
          console.error(e);
        }
      };

      const initGoogle = () => {
        if (window.google) {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleCallback,
            auto_select: false,
            use_fedcm_for_prompt: false,
            itp_support: false,
            ux_mode: 'popup'
          });
          const btn = document.getElementById('google-signin-button');
          if (btn) {
            window.google.accounts.id.renderButton(
              btn,
              { theme: 'outline', size: 'large', width: 250 }
            );
          }
          window.google.accounts.id.prompt();
        } else {
          setTimeout(initGoogle, 100);
        }
      };

      initGoogle();
    }
  }, [isLoadingAuth, user]);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/data');
      if (res.ok) {
        const data = await res.json();
        setCustomers(data.customers || []);
        setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      }
    } catch (e) {
      console.error('Failed to fetch data', e);
    }
  };

  const syncData = async (newCustomers: Customer[], newSettings: Settings) => {
    if (!user) return;
    setIsSyncing(true);
    try {
      await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customers: newCustomers, settings: newSettings }),
      });
    } catch (e) {
      toast.error('Sync failed');
      console.error(e);
    } finally {
      setIsSyncing(false);
    }
  };

  const persistCustomers = (newCustomers: Customer[]) => {
    setCustomers(newCustomers);
    syncData(newCustomers, settings);
  };

  const persistSettings = (newSettings: Settings) => {
    setSettings(newSettings);
    syncData(customers, newSettings);
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setCustomers([]);
      setSettings(DEFAULT_SETTINGS);
      setOtpSent(false);
      setPhoneNumber('');
      setOtp('');
      toast.info('Logged out successfully');
    } catch (e) {
      console.error(e);
    }
  };

  const handleSendOtp = async () => {
    const phone = phoneNumber.trim();
    console.log('Attempting to send OTP to:', phone);
    if (!phone) return toast.error('Enter phone number');
    setIsLoggingIn(true);
    try {
      const res = await fetch('/api/auth/phone/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      if (res.ok) {
        setOtpSent(true);
        const data = await res.json();
        toast.success(`OTP sent! (Demo OTP: ${data.otp})`);
      } else {
        const data = await res.json().catch(() => ({ error: 'Unknown server error' }));
        console.error('Phone auth error:', data);
        toast.error(data.error || `Failed to send OTP (${res.status})`);
      }
    } catch (e) {
      console.error('Fetch error:', e);
      toast.error('Failed to send OTP - check connection');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleVerifyOtp = async () => {
    const phone = phoneNumber.trim();
    const cleanOtp = otp.trim();
    if (!cleanOtp) return toast.error('Enter OTP');
    setIsLoggingIn(true);
    try {
      const res = await fetch('/api/auth/phone/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp: cleanOtp }),
      });
      const data = await res.json();
      if (data.user) {
        setUser(data.user);
        await fetchData();
        toast.success(`Welcome back!`);
      } else {
        toast.error(data.error || 'Verification failed');
      }
    } catch (e) {
      toast.error('Verification failed');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle Push Notifications
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermissionStatus(Notification.permission);
    } else {
      setPermissionStatus('unsupported');
    }
  }, []);

  const handleEnableNotifications = async () => {
    if (!('Notification' in window)) {
      toast.error('Notifications not supported by this browser');
      return;
    }
    
    const permission = await Notification.requestPermission();
    setPermissionStatus(permission);
    
    if (permission === 'granted') {
      toast.success('Local notifications enabled!');
    } else {
      toast.error('Permission denied for notifications');
    }
  };

  const handleTestNotification = async () => {
    if (Notification.permission === 'granted') {
      new Notification('Orm.AI', {
        body: 'Local test notification successful!',
        icon: '/favicon.ico'
      });
      toast.success('Test notification sent locally!');
    } else {
      toast.error('Please enable notifications first');
    }
  };

  const handleTestEmail = async () => {
    if (!settings.userEmail) {
      toast.error('Please set an email address in settings first');
      return;
    }
    try {
      const res = await fetch('/api/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: settings.userEmail })
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

  const handleAddCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomer.name || !newCustomer.number) {
      toast.error('Please fill in all required fields');
      return;
    }

    const addedAt = newCustomer.addedAtMode === 'today' 
      ? new Date().toISOString() 
      : new Date(newCustomer.customAddedAt || new Date()).toISOString();

    let portingDate = calculatePortingDate(addedAt);

    if (newCustomer.portingDateMode === 'manual' && newCustomer.manualPortingDate) {
      portingDate = new Date(newCustomer.manualPortingDate).toISOString();
    } else if (newCustomer.portingDateMode === 'days') {
      const days = parseInt(newCustomer.portingDaysOffset) || 90;
      const date = new Date(addedAt);
      date.setDate(date.getDate() + days);
      portingDate = date.toISOString();
    }

    const customer: Customer = {
      name: newCustomer.name,
      number: newCustomer.number,
      location: newCustomer.location,
      id: crypto.randomUUID(),
      addedAt,
      portingDate,
      portingDateMode: newCustomer.portingDateMode,
      portingDaysOffset: newCustomer.portingDaysOffset,
    };

    persistCustomers([customer, ...customers]);
    setNewCustomer({ 
      name: '', 
      number: '', 
      location: '', 
      addedAtMode: 'today', 
      customAddedAt: '', 
      portingDateMode: 'auto', 
      manualPortingDate: '',
      portingDaysOffset: '90' 
    });
    setIsAddDialogOpen(false);
    toast.success('Customer added successfully');
  };

  const handleUpdateCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer || !editingCustomer.name || !editingCustomer.number) {
      toast.error('Please fill in all required fields');
      return;
    }

    const newCustomers = customers.map(c => 
      c.id === editingCustomer.id ? editingCustomer : c
    );
    
    persistCustomers(newCustomers);
    setIsEditDialogOpen(false);
    setEditingCustomer(null);
    toast.success('Customer updated locally');
  };

  const handleUpdateSettings = (e: React.FormEvent) => {
    e.preventDefault();
    persistSettings(settings);
    setIsSettingsDialogOpen(false);
    toast.success('Settings updated locally');
  };

  const confirmDelete = (id: string) => {
    setCustomerToDelete(id);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteCustomer = () => {
    if (customerToDelete) {
      const newCustomers = customers.filter(c => c.id !== customerToDelete);
      persistCustomers(newCustomers);
      setIsDeleteDialogOpen(false);
      setCustomerToDelete(null);
      toast.info('Customer removed locally');
    }
  };

  const openEditDialog = (customer: Customer) => {
    setEditingCustomer({ 
      ...customer,
      portingDateMode: customer.portingDateMode || 'auto',
      portingDaysOffset: customer.portingDaysOffset || '90'
    });
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
    const eligible = customers.filter(c => getPortingStatus(c.addedAt, c.portingDate, settings.nearDays, settings.veryNearDays).isEligible).length;
    const near = customers.filter(c => {
      const s = getPortingStatus(c.addedAt, c.portingDate, settings.nearDays, settings.veryNearDays);
      return s.isNear && !s.isEligible;
    }).length;

    return { total: customers.length, eligible, near };
  }, [customers, settings]);

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center font-sans overflow-hidden">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md space-y-8"
        >
          <div className="text-center space-y-4">
            <div className="inline-flex bg-primary p-4 rounded-2xl text-primary-foreground shadow-2xl shadow-primary/20 rotate-3">
              <ShieldAlert className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <h1 className="text-5xl font-black tracking-tighter text-foreground italic">
                Orm.AI
              </h1>
              <p className="text-muted-foreground font-medium tracking-tight uppercase text-xs">
                90-Day Porting Intelligence Protocol
              </p>
            </div>
          </div>

          <Card className="border shadow-2xl rounded-3xl overflow-hidden relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-50" />
            <CardHeader className="text-center relative pt-8">
              <CardTitle className="text-xl font-bold tracking-tight">Access Secure Registry</CardTitle>
              <CardDescription>
                Authenticate to manage your customer porting protocol.
              </CardDescription>
            </CardHeader>
            <CardContent className="relative flex flex-col items-center pb-8 pt-4 px-8 space-y-6">
              
              <div className="flex w-full p-1 bg-muted rounded-xl mb-2">
                <Button 
                  variant={loginMethod === 'google' ? 'secondary' : 'ghost'} 
                  className="flex-1 rounded-lg text-xs font-bold uppercase tracking-wider h-9"
                  onClick={() => setLoginMethod('google')}
                >
                  Google
                </Button>
                <Button 
                  variant={loginMethod === 'phone' ? 'secondary' : 'ghost'} 
                  className="flex-1 rounded-lg text-xs font-bold uppercase tracking-wider h-9"
                  onClick={() => setLoginMethod('phone')}
                >
                  Phone
                </Button>
              </div>

              {loginMethod === 'google' ? (
                <div id="google-signin-button" className="min-h-[50px] flex items-center justify-center transition-transform hover:scale-105 active:scale-95" />
              ) : (
                <div className="w-full space-y-4">
                  {!otpSent ? (
                    <div className="space-y-4">
                      <div className="relative">
                        <Phone className="absolute left-3 top-3 w-4 h-4 text-muted-foreground opacity-50" />
                        <Input 
                          placeholder="Phone Number" 
                          className="pl-10 h-12 rounded-xl"
                          value={phoneNumber}
                          onChange={e => setPhoneNumber(e.target.value)}
                        />
                      </div>
                      <Button 
                        className="w-full h-12 rounded-xl text-sm font-bold tracking-tight"
                        disabled={isLoggingIn}
                        onClick={handleSendOtp}
                      >
                        {isLoggingIn ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Send OTP
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <Input 
                        placeholder="6-Digit OTP" 
                        className="h-12 rounded-xl text-center text-xl tracking-[0.5em] font-black"
                        maxLength={6}
                        value={otp}
                        onChange={e => setOtp(e.target.value)}
                      />
                      <Button 
                        className="w-full h-12 rounded-xl text-sm font-bold tracking-tight"
                        disabled={isLoggingIn}
                        onClick={handleVerifyOtp}
                      >
                        {isLoggingIn ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Verify & Login
                      </Button>
                      <Button 
                        variant="ghost" 
                        className="w-full text-xs uppercase tracking-widest text-muted-foreground"
                        onClick={() => setOtpSent(false)}
                      >
                        Change Number
                      </Button>
                    </div>
                  )}
                </div>
              )}
              
              <div className="pt-4 border-t w-full flex items-center justify-center gap-6 opacity-30">
                <div className="flex items-center gap-1.5 grayscale">
                  <ShieldCheck className="w-4 h-4" />
                  <span className="text-[10px] uppercase font-black tracking-tighter">Encrypted</span>
                </div>
                <div className="flex items-center gap-1.5 grayscale">
                  <Globe className="w-4 h-4" />
                  <span className="text-[10px] uppercase font-black tracking-tighter">Synced</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <p className="text-center text-[10px] text-muted-foreground uppercase tracking-[0.3em] font-bold opacity-30 pt-8 italic">
            Authorized Personnel Only
          </p>
        </motion.div>
        <Toaster position="top-right" richColors />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 font-sans transition-colors duration-300">
      <Toaster position="top-right" richColors />
      
      <div className="max-w-6xl mx-auto space-y-8">
        <>
            {/* Notification Setup Dialog */}
            <Dialog 
              open={permissionStatus === 'default' && !settings.hasDismissedPromo} 
              onOpenChange={(open) => {
                if (!open) {
                  const newSettings = { ...settings, hasDismissedPromo: true };
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
                <ShieldAlert className="w-8 h-8" />
              </div>
              Orm.AI
              {isSyncing && (
                <div className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </div>
              )}
            </h1>
            <p className="text-muted-foreground font-medium tracking-wide uppercase text-xs">Remember everyone • Premium Retention Protocol</p>
          </div>

          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="rounded-full pl-1 pr-4 py-1 h-10 gap-2 border-foreground/10 hover:bg-muted/50 transition-all">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user.picture} />
                    <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className="text-xs font-bold uppercase tracking-tight">{user.name.split(' ')[0]}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl p-2 border-foreground/10">
                <div className="flex items-center gap-2 p-2 mb-2">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={user.picture} />
                    <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-bold truncate tracking-tight">{user.name}</span>
                    <span className="text-[10px] text-muted-foreground truncate font-mono uppercase opacity-50">{user.email}</span>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setIsSettingsDialogOpen(true)} className="rounded-lg h-9 gap-2">
                  <SettingsIcon className="w-4 h-4 opacity-50" />
                  <span className="text-xs font-bold uppercase tracking-tight">Protocol Settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="rounded-lg h-9 gap-2">
                  {theme === 'dark' ? <Sun className="w-4 h-4 opacity-50" /> : <Moon className="w-4 h-4 opacity-50" />}
                  <span className="text-xs font-bold uppercase tracking-tight">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="rounded-lg h-9 gap-2 text-destructive focus:text-destructive focus:bg-destructive/10">
                  <LogOut className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-tight">Terminate Session</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={isSettingsDialogOpen} onOpenChange={setIsSettingsDialogOpen}>
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
                    <div className="space-y-4 pt-2 border-t border-foreground/5">
                      <Label htmlFor="email" className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Notification Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="your@email.com"
                        className="font-mono"
                        value={settings.userEmail || ''}
                        onChange={e => setSettings({ ...settings, userEmail: e.target.value })}
                      />
                      <p className="text-[10px] text-muted-foreground font-medium">Email used for eligibility reports.</p>
                      
                      <Button 
                        type="button"
                        variant="ghost" 
                        size="sm" 
                        onClick={handleTestEmail}
                        className="w-full h-8 text-[9px] font-black uppercase tracking-widest rounded-none border border-dashed border-foreground/10 hover:bg-muted mt-2"
                      >
                        Send Test Email
                      </Button>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" className="w-full font-black uppercase tracking-widest text-[10px] h-12 rounded-none">Save Settings</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="lg" className="rounded-full shadow-lg hover:shadow-xl transition-all h-12 px-6">
                  <Plus className="w-5 h-5 mr-2" />
                  Add Customer
                </Button>
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
                      <UserIcon className="absolute left-3 top-3 w-4 h-4 text-muted-foreground opacity-50" />
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

                  <div className="space-y-4 pt-2 border-t border-foreground/5">
                    <div className="space-y-3">
                      <Label className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Activation Date</Label>
                      <div className="flex gap-2 p-1 bg-muted/30 border border-foreground/10 rounded-none">
                        <Button
                          type="button"
                          variant={newCustomer.addedAtMode === 'today' ? 'default' : 'ghost'}
                          size="sm"
                          className="flex-1 text-[10px] uppercase font-black tracking-widest h-8 rounded-none"
                          onClick={() => setNewCustomer({ ...newCustomer, addedAtMode: 'today' })}
                        >
                          Today
                        </Button>
                        <Button
                          type="button"
                          variant={newCustomer.addedAtMode === 'custom' ? 'default' : 'ghost'}
                          size="sm"
                          className="flex-1 text-[10px] uppercase font-black tracking-widest h-8 rounded-none"
                          onClick={() => setNewCustomer({ ...newCustomer, addedAtMode: 'custom' })}
                        >
                          Pick
                        </Button>
                      </div>
                      
                      {newCustomer.addedAtMode === 'custom' && (
                        <div className="relative animate-in fade-in slide-in-from-top-1 duration-200">
                          <Calendar className="absolute left-3 top-3 w-4 h-4 text-muted-foreground opacity-50" />
                          <Input
                            type="date"
                            className="pl-10 font-mono text-xs h-10 border-foreground/10 rounded-none"
                            value={newCustomer.customAddedAt}
                            onChange={e => setNewCustomer({ ...newCustomer, customAddedAt: e.target.value })}
                          />
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 pt-2">
                       <div className="flex items-center justify-between">
                        <Label className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Porting Date</Label>
                        <div className="flex bg-muted/40 p-0.5 rounded-sm border border-foreground/5">
                          <button
                            type="button"
                            onClick={() => setNewCustomer({ ...newCustomer, portingDateMode: 'auto' })}
                            className={`px-2 py-1 text-[9px] font-black uppercase transition-all ${newCustomer.portingDateMode === 'auto' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                          >
                            Auto
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewCustomer({ ...newCustomer, portingDateMode: 'days' })}
                            className={`px-2 py-1 text-[9px] font-black uppercase transition-all ${newCustomer.portingDateMode === 'days' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                          >
                            Days
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewCustomer({ ...newCustomer, portingDateMode: 'manual' })}
                            className={`px-2 py-1 text-[9px] font-black uppercase transition-all ${newCustomer.portingDateMode === 'manual' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                          >
                            Date
                          </button>
                        </div>
                      </div>

                      {newCustomer.portingDateMode === 'manual' && (
                        <div className="relative animate-in fade-in slide-in-from-top-1 duration-200">
                          <Calendar className="absolute left-3 top-3 w-4 h-4 text-muted-foreground opacity-50" />
                          <Input
                            type="date"
                            className="pl-10 font-mono text-xs h-10 border-foreground/10 rounded-none"
                            value={newCustomer.manualPortingDate}
                            onChange={e => setNewCustomer({ ...newCustomer, manualPortingDate: e.target.value })}
                          />
                        </div>
                      )}

                      {newCustomer.portingDateMode === 'days' && (
                        <div className="flex items-center space-x-2 animate-in fade-in slide-in-from-top-1 duration-200">
                          <div className="relative flex-1">
                            <Clock className="absolute left-3 top-3 w-4 h-4 text-muted-foreground opacity-50" />
                            <Input
                              type="number"
                              placeholder="Days"
                              className="pl-10 font-mono text-xs h-10 border-foreground/10 rounded-none"
                              value={newCustomer.portingDaysOffset}
                              onChange={e => setNewCustomer({ ...newCustomer, portingDaysOffset: e.target.value })}
                            />
                          </div>
                          <span className="text-[10px] font-black uppercase text-muted-foreground">Days</span>
                        </div>
                      )}

                      {newCustomer.portingDateMode !== 'manual' && (
                        <div className="p-3 border border-dashed border-foreground/10 bg-muted/10 text-center">
                          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest leading-relaxed">
                            {newCustomer.portingDateMode === 'auto' ? 'Standard (90 Days)' : `Custom (${newCustomer.portingDaysOffset || 0} Days)`}
                            <br />
                            <span className="text-foreground/60">Eligible: {formatDate(
                              (() => {
                                const baseDate = newCustomer.addedAtMode === 'today' ? new Date() : new Date(newCustomer.customAddedAt || new Date());
                                const offset = newCustomer.portingDateMode === 'auto' ? 90 : (parseInt(newCustomer.portingDaysOffset) || 0);
                                baseDate.setDate(baseDate.getDate() + offset);
                                return baseDate.toISOString();
                              })()
                            )}</span>
                          </p>
                        </div>
                      )}
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
                      <UserIcon className="absolute left-3 top-3 w-4 h-4 text-muted-foreground opacity-50" />
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

                  <div className="space-y-4 pt-4 border-t border-foreground/5">
                    <div className="space-y-3">
                      <Label className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Activation Date</Label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-3 w-4 h-4 text-muted-foreground opacity-50" />
                        <Input
                          id="edit-added-at"
                          type="date"
                          className="pl-10 font-mono"
                          value={editingCustomer.addedAt.split('T')[0]}
                          onChange={e => {
                            const newAddedAt = new Date(e.target.value).toISOString();
                            let newPortingDate = editingCustomer.portingDate;
                            
                            // Re-calculate if in auto or days mode
                            if (editingCustomer.portingDateMode === 'auto') {
                              const date = new Date(newAddedAt);
                              date.setDate(date.getDate() + 90);
                              newPortingDate = date.toISOString();
                            } else if (editingCustomer.portingDateMode === 'days') {
                              const days = parseInt(editingCustomer.portingDaysOffset || '90') || 0;
                              const date = new Date(newAddedAt);
                              date.setDate(date.getDate() + days);
                              newPortingDate = date.toISOString();
                            }
                            
                            setEditingCustomer({ 
                              ...editingCustomer, 
                              addedAt: newAddedAt,
                              portingDate: newPortingDate
                            });
                          }}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground font-medium">The date the SIM/Service was activated.</p>
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-foreground/5">
                    <div className="space-y-3">
                      <Label className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Porting Eligibility Date</Label>
                      <div className="flex gap-2 p-1 bg-muted/30 border border-foreground/10 rounded-none">
                        <Button
                          type="button"
                          variant={editingCustomer.portingDateMode === 'auto' ? 'default' : 'ghost'}
                          size="sm"
                          className="flex-1 text-[10px] uppercase font-black tracking-widest h-8 rounded-none"
                          onClick={() => {
                            const date = new Date(editingCustomer.addedAt);
                            date.setDate(date.getDate() + 90);
                            setEditingCustomer({ ...editingCustomer, portingDateMode: 'auto', portingDate: date.toISOString() });
                          }}
                        >
                          Auto (90d)
                        </Button>
                        <Button
                          type="button"
                          variant={editingCustomer.portingDateMode === 'days' ? 'default' : 'ghost'}
                          size="sm"
                          className="flex-1 text-[10px] uppercase font-black tracking-widest h-8 rounded-none"
                          onClick={() => setEditingCustomer({ ...editingCustomer, portingDateMode: 'days' })}
                        >
                          Days
                        </Button>
                        <Button
                          type="button"
                          variant={editingCustomer.portingDateMode === 'manual' ? 'default' : 'ghost'}
                          size="sm"
                          className="flex-1 text-[10px] uppercase font-black tracking-widest h-8 rounded-none"
                          onClick={() => setEditingCustomer({ ...editingCustomer, portingDateMode: 'manual' })}
                        >
                          Manual
                        </Button>
                      </div>

                      {editingCustomer.portingDateMode === 'days' && (
                        <div className="space-y-2 pt-2 animate-in slide-in-from-top-2 duration-200">
                          <Label htmlFor="edit-porting-days" className="text-[10px] font-bold text-muted-foreground uppercase">Number of Days from Activation</Label>
                          <Input
                            id="edit-porting-days"
                            type="number"
                            placeholder="e.g. 30"
                            className="font-mono"
                            value={editingCustomer.portingDaysOffset || '90'}
                            onChange={e => {
                              const days = parseInt(e.target.value) || 0;
                              const date = new Date(editingCustomer.addedAt);
                              date.setDate(date.getDate() + days);
                              setEditingCustomer({ ...editingCustomer, portingDaysOffset: e.target.value, portingDate: date.toISOString() });
                            }}
                          />
                        </div>
                      )}

                      {editingCustomer.portingDateMode === 'manual' && (
                        <div className="space-y-2 pt-2 animate-in slide-in-from-top-2 duration-200">
                          <Label htmlFor="edit-porting-date" className="text-[10px] font-bold text-muted-foreground uppercase">Pick Custom Date</Label>
                          <div className="relative">
                            <Calendar className="absolute left-3 top-3 w-4 h-4 text-muted-foreground opacity-50" />
                            <Input
                              id="edit-porting-date"
                              type="date"
                              className="pl-10 font-mono"
                              value={editingCustomer.portingDate.split('T')[0]}
                              onChange={e => setEditingCustomer({ ...editingCustomer, portingDate: new Date(e.target.value).toISOString() })}
                            />
                          </div>
                        </div>
                      )}

                      <div className="p-3 bg-primary/5 border border-primary/10 rounded-none mt-4">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Estimated Eligibility</p>
                        <p className="text-sm font-black text-primary font-mono">{formatDate(editingCustomer.portingDate)}</p>
                      </div>
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
              <UserIcon className="w-4 h-4 text-muted-foreground opacity-50" />
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
                        const status = getPortingStatus(customer.addedAt, customer.portingDate, settings.nearDays, settings.veryNearDays);
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
                              <div className="flex flex-col gap-2">
                                {status.isEligible ? (
                                  <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border-emerald-200/50 flex items-center gap-1.5 w-fit">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Eligible Now
                                  </Badge>
                                ) : status.isVeryNear ? (
                                  <Badge variant="destructive" className="animate-pulse flex items-center gap-1.5 w-fit">
                                    <AlertTriangle className="w-3 h-3" />
                                    {status.daysRemaining} Days Left
                                  </Badge>
                                ) : status.isNear ? (
                                  <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50 border-amber-200/50 flex items-center gap-1.5 w-fit">
                                    <Clock className="w-3 h-3" />
                                    {status.daysRemaining} Days Left
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="font-normal flex items-center gap-1.5 w-fit opacity-70">
                                    <Calendar className="w-3 h-3" />
                                    {status.daysRemaining} Days
                                  </Badge>
                                )}
                                
                                {/* Progress mini-bar */}
                                {!status.isEligible && (
                                  <div className="w-full h-1 bg-muted/50 rounded-full overflow-hidden max-w-[100px]">
                                    <div 
                                      className={`h-full transition-all duration-500 ${
                                        status.isVeryNear ? 'bg-destructive' : status.isNear ? 'bg-amber-500' : 'bg-primary/40'
                                      }`}
                                      style={{ width: `${status.progress * 100}%` }}
                                    />
                                  </div>
                                )}
                              </div>
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
                    const status = getPortingStatus(customer.addedAt, customer.portingDate, settings.nearDays, settings.veryNearDays);
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
                            <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-none font-black uppercase text-[9px] tracking-widest rounded-none flex items-center gap-1">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              Eligible
                            </Badge>
                          ) : status.isVeryNear ? (
                            <Badge variant="destructive" className="animate-pulse font-black uppercase text-[9px] tracking-widest rounded-none flex items-center gap-1">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              {status.daysRemaining}d Left
                            </Badge>
                          ) : status.isNear ? (
                            <Badge className="bg-amber-50 text-amber-700 hover:bg-foreground/20 border-none font-black uppercase text-[9px] tracking-widest rounded-none flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" />
                              {status.daysRemaining}d Left
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="font-black uppercase text-[9px] tracking-widest rounded-none border-foreground/10 flex items-center gap-1">
                              <Calendar className="w-2.5 h-2.5 opacity-50" />
                              {status.daysRemaining}d
                            </Badge>
                          )}
                        </div>

                        {/* Progress Bar for Mobile */}
                        {!status.isEligible && (
                          <div className="w-full h-1 bg-muted/50 rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all duration-500 ${
                                status.isVeryNear ? 'bg-destructive' : status.isNear ? 'bg-amber-500' : 'bg-primary'
                              }`}
                              style={{ width: `${status.progress * 100}%` }}
                            />
                          </div>
                        )}

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
            </span> from your registry.
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
