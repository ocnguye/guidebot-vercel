"use client";

import Link from "next/link";
import { Bot, FileSearch } from "lucide-react";

export default function Home() {
  return (
    <div className="flex items-center justify-center h-screen bg-purple-100 p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl w-full">
        {/* GuideBot Tile */}
        <Link href="/guidebot-home" className="group">
          <div className="flex flex-col items-center justify-center bg-white rounded-2xl shadow-lg p-10 transition-transform transform hover:scale-105 hover:shadow-2xl h-64">
            <div className="bg-purple-300 text-white rounded-full p-4 mb-6 group-hover:bg-purple-400 transition-colors">
              <Bot size={48} />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">GuideBot</h2>
            <p className="text-gray-600 text-center">
              Chat with the AI assistant to learn about medical procedures.
            </p>
          </div>
        </Link>

        {/* RadExtract Tile */}
        <Link href="/radextract-home" className="group">
          <div className="flex flex-col items-center justify-center bg-white rounded-2xl shadow-lg p-10 transition-transform transform hover:scale-105 hover:shadow-2xl h-64">
            <div className="bg-purple-300 text-white rounded-full p-4 mb-6 group-hover:bg-purple-400 transition-colors">
              <FileSearch size={48} />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">RadExtract</h2>
            <p className="text-gray-600 text-center">
              Extract, analyze, and manage radiology reports with ease.
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
