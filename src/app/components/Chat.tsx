'use client'
import { useState } from "react"
import { Message } from "../../../types/types"
import { ArrowUp } from "lucide-react"
import { Plus } from "lucide-react"

export default function Chat() {
    
    const [text, setText] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);


    return (
        <main className="mx-auto flex h-dvh w-full max-w-4xl flex-col px-4 text-slate-100 sm:px-6">

            <header className="shrink-0 border-b border-white/10 py-5">
                <h1 className="text-lg font-semibold">AI Chat</h1>
            </header>   

            <section 
                aria-label="История диалога"
                className="min-h-0 flex-1 overflow-y-auto py-6"
            >
                <ul className="flex flex-col gap-4">
                    {
                        messages.map((message) => (
                            <li     
                                key={message.id}
                                className=
                                {
                                    message.role === "user"
                                    ? "self-end max-w-[85%] rounded-2xl bg-cyan-900 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap wrap-break-word sm:max-w-[75%] sm:text-base"
                                    : "self-start max-w-[85%] px-1 py-3 text-sm leading-relaxed whitespace-pre-wrap wrap-break-word sm:max-w-[75%] sm:text-base"
                                }    
                            >
                                {message.content}
                            </li>
                        ))
                    }
                </ul>
            </section>
            
            <div
                className="shrink-0 pb-4"
            >
                <form 
                    onSubmit={(e) => {
                        e.preventDefault();

                        const content = text.trim();
                        if (!content) return;

                        const message: Message = {
                            id: Date.now(),
                            role: 'user',
                            content,
                        };

                        setMessages((current) => [...current, message]);
                        setText('');
                    }}
                    className="flex justify-between items-center px-2 py-1 flex-1 m-2 gap-3 font-bold font-mono border border-white rounded-full w-full"    
                >

                    <button
                        type="button"
                        className="text-white rounded-full border border-white w-8 h-8 bg-[#252525] hover:border-cyan-500 active:border-cyan-500 hover:text-cyan-500 active:text-cyan-500 cursor-pointer m-2"                    
                    >
                        <Plus className="h-4 w-full"/>
                    </button>

                    <textarea 
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="border-white border rounded-lg px-4 h-8 w-3/4"
                        onKeyDown={(e) => {
                            if(e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                e.currentTarget.form?.requestSubmit();
                            }
                        }}
                    />

                    <button
                        type="submit"
                        className="text-white rounded-full border border-white w-8 h-8 bg-[#252525] hover:border-cyan-500 active:border-cyan-500 hover:text-cyan-500 active:text-cyan-500 cursor-pointer m-2"                    
                    >
                        <ArrowUp className="h-4 w-full"/>
                    </button>
                </form>
            </div>

        </main>
    )
}