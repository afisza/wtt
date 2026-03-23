import { Link } from 'react-router'
import { FileQuestion, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center max-w-md animate-fade-in">
        <div className="rounded-full bg-muted p-6 inline-flex mb-6">
          <FileQuestion className="h-12 w-12 text-muted-foreground" />
        </div>
        <h1 className="text-4xl font-bold text-foreground mb-2">404</h1>
        <p className="text-lg text-muted-foreground mb-6">
          Strona, której szukasz, nie istnieje lub została przeniesiona.
        </p>
        <Button asChild size="lg">
          <Link to="/">
            <Home className="h-4 w-4 mr-2" />
            Wróć na stronę główną
          </Link>
        </Button>
      </div>
    </div>
  )
}
