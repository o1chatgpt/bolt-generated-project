import { useState, useCallback } from 'react';
import { ChevronRight, File, Folder, FolderOpen, Upload, FileJson, FileText, Settings, Send, BookOpen, ChevronDown, Bookmark } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Editor from '@monaco-editor/react';
import { marked } from 'marked';
import yaml from 'js-yaml';
import { aiPersonalities, generateAIResponse } from '@/lib/openai';

interface FileNode {
  name: string;
  type: 'file' | 'folder';
  mimeType?: string;
  children?: FileNode[];
  content?: string;
}

const apiKeySchema = z.object({
  apiKey: z.string().min(1, 'API Key is required'),
});

const demoFiles: FileNode[] = [
  {
    name: 'Documents',
    type: 'folder',
    children: [
      { name: 'config.yaml', type: 'file', mimeType: 'application/yaml' },
      { name: 'data.json', type: 'file', mimeType: 'application/json' },
      {
        name: 'Notes',
        type: 'folder',
        children: [
          { name: 'meeting-notes.md', type: 'file', mimeType: 'text/markdown' },
          { name: 'todo.md', type: 'file', mimeType: 'text/markdown' },
        ],
      },
    ],
  },
  { name: 'README.md', type: 'file', mimeType: 'text/markdown' },
];

interface FileItemProps {
  node: FileNode;
  depth: number;
  selectedPath: string[];
  onSelect: (path: string[], node: FileNode) => void;
}

const FileItem = ({ node, depth, selectedPath, onSelect }: FileItemProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const isSelected = selectedPath.join('/') === node.name;
  const currentPath = [node.name];

  const handleClick = () => {
    if (node.type === 'folder') {
      setIsOpen(!isOpen);
    }
    onSelect(currentPath, node);
  };

  const getFileIcon = () => {
    if (node.type === 'folder') {
      return isOpen ? <FolderOpen className="h-4 w-4 text-blue-500" /> : <Folder className="h-4 w-4 text-blue-500" />;
    }
    
    switch (node.mimeType) {
      case 'application/json':
        return <FileJson className="h-4 w-4 text-orange-500" />;
      case 'text/markdown':
        return <FileText className="h-4 w-4 text-purple-500" />;
      case 'application/yaml':
        return <FileText className="h-4 w-4 text-green-500" />;
      default:
        return <File className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-2 p-1 rounded-md cursor-pointer hover:bg-accent/50 backdrop-blur-sm transition-all',
          isSelected && 'bg-accent/70',
        )}
        style={{ paddingLeft: `${depth * 16}px` }}
        onClick={handleClick}
      >
        {node.type === 'folder' && (
          <ChevronRight
            className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-90')}
          />
        )}
        {getFileIcon()}
        <span className="text-sm">{node.name}</span>
      </div>
      {isOpen &&
        node.children?.map((child) => (
          <FileItem
            key={child.name}
            node={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            onSelect={(childPath, node) => onSelect([...currentPath, ...childPath], node)}
          />
        ))}
    </div>
  );
};

const promptGuideTemplate = `# Prompt Guide

## System Message
Define the AI's role and behavior.

## User Message
Clearly state your request or question.

## Examples
- "Analyze this code for potential improvements"
- "Explain the purpose of this function"
- "Suggest a better implementation for..."

## Best Practices
1. Be specific and clear
2. Provide context
3. Use examples when helpful
4. Break complex requests into steps`;

const promptExamples = [
  {
    title: "Code Review",
    template: `# Code Review Assistant

## Role
Act as a senior software engineer conducting a thorough code review.

## Focus Areas
1. Code quality and best practices
2. Performance optimization
3. Security considerations
4. Testing coverage
5. Documentation quality
6. Error handling
7. Edge cases consideration`
  },
  {
    title: "API Design",
    template: `# API Design Guide

## Objectives
- RESTful principles
- Clear endpoint naming
- Proper status codes
- Authentication/Authorization
- Rate limiting considerations
- API versioning strategy
- Error handling standards
- Documentation requirements`
  },
  {
    title: "Documentation",
    template: `# Technical Documentation

## Structure
1. Overview
2. Getting Started
3. API Reference
4. Examples
5. Troubleshooting
6. Best Practices
7. Security Considerations
8. Performance Guidelines`
  },
  {
    title: "Architecture Review",
    template: `# Architecture Review Guide

## Focus Areas
1. System Design
2. Scalability
3. Performance
4. Security
5. Maintainability
6. Cost Optimization
7. Technology Stack
8. Integration Points`
  },
  {
    title: "Security Audit",
    template: `# Security Audit Template

## Checklist
1. Authentication
2. Authorization
3. Data Encryption
4. Input Validation
5. Error Handling
6. Logging
7. Dependencies
8. API Security`
  }
];

const chatPromptExamples = [
  {
    title: "Code Analysis",
    content: "Analyze this code for potential performance improvements and security vulnerabilities."
  },
  {
    title: "Feature Planning",
    content: "Help me plan the implementation of a new authentication system using JWT."
  },
  {
    title: "Bug Investigation",
    content: "Review this error log and help identify the root cause of the issue."
  }
];

export function FileExplorer() {
  const [selectedPath, setSelectedPath] = useState<string[]>([]);
  const [files, setFiles] = useState<FileNode[]>(demoFiles);
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
  const [customInstructions, setCustomInstructions] = useState<string>('');
  const [chatPrompt, setChatPrompt] = useState<string>('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [aiResponse, setAiResponse] = useState<string>('');
  const [promptTemplate, setPromptTemplate] = useState(promptGuideTemplate);
  const [promptTarget, setPromptTarget] = useState<'instructions' | 'analysis'>('instructions');
  const [chatHistory, setChatHistory] = useState<Array<{ prompt: string; response: string }>>([]);
  const [bookmarks, setBookmarks] = useState<Array<{ id: string; content: string }>>([]);
  const [activeTab, setActiveTab] = useState('output');
  const [selectedPersonality, setSelectedPersonality] = useState<keyof typeof aiPersonalities>('codeReviewer');
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof apiKeySchema>>({
    resolver: zodResolver(apiKeySchema),
  });

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files;
    if (!uploadedFiles) return;

    const newFiles: FileNode[] = Array.from(uploadedFiles).map((file) => ({
      name: file.name,
      type: 'file',
      mimeType: file.type,
    }));

    setFiles((prevFiles) => [...prevFiles, ...newFiles]);
  }, []);

  const handleSelect = (path: string[], node: FileNode) => {
    setSelectedPath(path);
    setSelectedNode(node);
  };

  const handleCustomInstructionsChange = (value: string | undefined) => {
    if (value !== undefined) {
      setCustomInstructions(value);
    }
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatPrompt.trim()) return;

    setIsLoading(true);
    try {
      const response = await generateAIResponse(
        selectedPersonality,
        customInstructions,
        chatPrompt
      );

      const formattedResponse = formatAIResponse(response);
      setAiResponse(formattedResponse);
      setChatHistory(prev => [...prev, { prompt: chatPrompt, response: formattedResponse }]);
      setChatPrompt('');
    } catch (error) {
      console.error('Error:', error);
      setAiResponse('Error generating response. Please check your API key and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const formatAIResponse = (response: string) => {
    // Format code blocks with syntax highlighting
    const formattedResponse = response.replace(
      /```(\w+)?\n([\s\S]*?)```/g,
      (_, lang, code) => `<pre><code class="language-${lang || 'text'}">${code}</code></pre>`
    );

    // Format conversation blocks
    return formattedResponse.replace(
      /(User|Assistant):\s*(.*?)(?=(?:User|Assistant):|$)/gs,
      (_, role, content) => `
        <div class="flex items-center gap-2 p-2 rounded-lg ${role === 'User' ? 'bg-blue-500/10' : 'bg-green-500/10'}">
          <div class="flex-shrink-0">
            ${role === 'User' ? '👤' : '🤖'}
          </div>
          <div class="flex-1">
            <strong>${role}:</strong>
            ${content.trim()}
          </div>
        </div>
      `
    );
  };

  const handleBookmark = (content: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    setBookmarks(prev => [...prev, { id, content }]);
  };

  const handlePromptSubmit = () => {
    if (promptTarget === 'instructions') {
      setCustomInstructions(promptTemplate);
    } else {
      setAiResponse(promptTemplate);
    }
  };

  return (
    <div className="grid grid-cols-[300px_1fr_400px] gap-4 w-full max-w-[1400px] h-[800px] p-4 rounded-lg bg-background/30 backdrop-blur-md border">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
          <h3 className="text-sm font-medium">File Explorer</h3>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            >
              <Settings className="h-4 w-4" />
            </Button>
            <div className="relative">
              <input
                type="file"
                multiple
                accept=".md,.json,.yaml,.yml"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={handleFileUpload}
              />
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Upload className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <Collapsible open={isSettingsOpen}>
          <CollapsibleContent className="p-2 space-y-4 bg-muted/30 rounded-md">
            <Form {...form}>
              <form className="space-y-2">
                <FormField
                  control={form.control}
                  name="apiKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>OpenAI API Key</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" size="sm">Save</Button>
              </form>
            </Form>
          </CollapsibleContent>
        </Collapsible>

        <div className="flex-1 overflow-auto">
          {files.map((node) => (
            <FileItem
              key={node.name}
              node={node}
              depth={0}
              selectedPath={selectedPath}
              onSelect={handleSelect}
            />
          ))}
        </div>

        <div className="space-y-2">
          {promptExamples.map((example, index) => (
            <Dialog key={index}>
              <DialogTrigger asChild>
                <Card className="p-3 bg-muted/20 hover:bg-muted/30 cursor-pointer transition-colors">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    <div className="flex-1">
                      <h4 className="text-sm font-medium">{example.title}</h4>
                    </div>
                  </div>
                </Card>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{example.title}</DialogTitle>
                </DialogHeader>
                <Textarea
                  value={example.template}
                  readOnly
                  className="min-h-[300px] font-mono"
                />
                <Button onClick={() => setCustomInstructions(example.template)}>
                  Use Template
                </Button>
              </DialogContent>
            </Dialog>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="p-2 bg-muted/50 rounded-t-md">
            <h3 className="text-sm font-medium">Custom Instructions</h3>
          </div>
          <Editor
            height="60%"
            language="markdown"
            theme="vs-dark"
            value={customInstructions}
            onChange={handleCustomInstructionsChange}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: 'on',
              roundedSelection: true,
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
          <div className="p-2 bg-muted/50 mt-4">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium">AI Assistant</h3>
              <Select
                value={selectedPersonality}
                onValueChange={(value) => setSelectedPersonality(value as keyof typeof aiPersonalities)}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select AI Personality" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(aiPersonalities).map(([key, { name }]) => (
                    <SelectItem key={key} value={key}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <form onSubmit={handleChatSubmit} className="mt-2 flex gap-2">
            <Textarea
              value={chatPrompt}
              onChange={(e) => setChatPrompt(e.target.value)}
              placeholder="Enter your prompt..."
              className="flex-1 bg-muted/20 focus:bg-muted/30 transition-colors"
            />
            <Button type="submit" size="icon" className="h-full" disabled={isLoading}>
              {isLoading ? (
                <div className="animate-spin">⌛</div>
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>

        <div className="flex flex-wrap gap-2 mt-2">
          {chatPromptExamples.map((example, index) => (
            <Card
              key={index}
              className="p-2 bg-muted/20 hover:bg-muted/30 cursor-pointer transition-colors"
              onClick={() => setChatPrompt(example.content)}
            >
              <h4 className="text-sm font-medium">{example.title}</h4>
              <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                {example.content}
              </p>
            </Card>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="output">Output</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="bookmarks">Bookmarks</TabsTrigger>
          </TabsList>
          
          <TabsContent value="output" className="flex-1 overflow-auto">
            <Card className="h-full p-4 bg-muted/30 backdrop-blur-sm">
              <div className="prose prose-sm dark:prose-invert" dangerouslySetInnerHTML={{ __html: marked(aiResponse) }} />
            </Card>
          </TabsContent>
          
          <TabsContent value="history" className="flex-1 overflow-auto">
            <Card className="h-full p-4 bg-muted/30 backdrop-blur-sm">
              {chatHistory.map((item, index) => (
                <div key={index} className="mb-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Prompt {index + 1}</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleBookmark(item.response)}
                    >
                      <Bookmark className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="prose prose-sm dark:prose-invert mt-2" dangerouslySetInnerHTML={{ __html: marked(item.response) }} />
                  <Separator className="my-2" />
                </div>
              ))}
            </Card>
          </TabsContent>
          
          <TabsContent value="bookmarks" className="flex-1 overflow-auto">
            <Card className="h-full p-4 bg-muted/30 backdrop-blur-sm">
              {bookmarks.map((bookmark) => (
                <div key={bookmark.id} className="mb-4">
                  <div className="prose prose-sm dark:prose-invert" dangerouslySetInnerHTML={{ __html: marked(bookmark.content) }} />
                  <Separator className="my-2" />
                </div>
              ))}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
