
"use client";

import { useEffect, useRef, useState } from 'react';
import SwipeCard from '@/components/SwipeCard';
import Lottie from 'lottie-react';
import loaderDots from '@/app/lotties/loader-dots.json';
import sparklesData from '@/app/lotties/sparkles.json';
import Link from 'next/link';
import { SOURCE_COLOR_FLAT as SOURCE_COLORS } from '@/lib/constants';
import { Copy, Check, X, FileText, Send, AlertTriangle, PlusCircle, Sparkles, Download, RefreshCw, ThumbsDown, ThumbsUp, List, Layers, Trash2 } from 'lucide-react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
